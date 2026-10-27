import type {
  AppliedPolicy,
  DecisionType,
  Gender,
  LoanRequestInput,
  ShapFactor,
} from "./types";

export const MAX_FOIR = 0.6;
export const BENCHMARK_RATE = 11.5;
export const MAX_AGE = 60;
export const MAX_TENURE = 84;
export const MIN_RATE = 7.5;

/* ---------------------------------------------------------------------------
 * EMI / max-loan math (port of affordability_agent.py)
 * ------------------------------------------------------------------------ */

export function calculateEmi(principal: number, annualRate: number, tenureMonths: number): number {
  if (principal <= 0 || tenureMonths <= 0) return 0;
  const r = annualRate / 12 / 100;
  if (r === 0) return principal / tenureMonths;
  const f = Math.pow(1 + r, tenureMonths);
  return (principal * r * f) / (f - 1);
}

export function calculateMaxLoan(allowedEmi: number, annualRate: number, tenureMonths: number): number {
  if (allowedEmi <= 0 || tenureMonths <= 0) return 0;
  const r = annualRate / 12 / 100;
  if (r === 0) return allowedEmi * tenureMonths;
  const f = Math.pow(1 + r, tenureMonths);
  return (allowedEmi * (f - 1)) / (r * f);
}

const inr = (v: number) =>
  `₹${Math.round(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export interface AffordabilityResult {
  is_eligible: boolean;
  decision_type: DecisionType;
  foir: number;
  requested_foir: number;
  adjusted_loan: number;
  adjusted_tenure: number;
  estimated_emi: number;
  allowed_emi: number;
  action_taken: string;
  reason: string;
  eligibility_message: string;
  loan_reduction: number;
}

function rejected(
  foir: number,
  reason: string,
  requestedFoir?: number,
): AffordabilityResult {
  return {
    is_eligible: false,
    decision_type: "REJECTED",
    foir,
    requested_foir: requestedFoir ?? foir,
    adjusted_loan: 0,
    adjusted_tenure: 0,
    estimated_emi: 0,
    allowed_emi: 0,
    action_taken: "REJECTED_FOIR_EXCEEDED",
    reason,
    eligibility_message:
      "The requested loan is not eligible based on the information provided because the affordability limit has been exceeded.",
    loan_reduction: 0,
  };
}

export function assessAffordability(p: LoanRequestInput): AffordabilityResult {
  if (p.monthly_income <= 0) {
    return rejected(999, "Monthly income must be greater than zero.");
  }

  const requestedEmi = calculateEmi(p.requested_loan, BENCHMARK_RATE, p.requested_tenure);
  const existingObligations = p.existing_emi + p.house_rent;
  const requestedFoir = (existingObligations + requestedEmi) / p.monthly_income;

  if (requestedFoir <= MAX_FOIR) {
    return {
      is_eligible: true,
      decision_type: "APPROVED_AS_REQUESTED",
      foir: requestedFoir,
      requested_foir: requestedFoir,
      adjusted_loan: p.requested_loan,
      adjusted_tenure: p.requested_tenure,
      estimated_emi: requestedEmi,
      allowed_emi: requestedEmi,
      action_taken: "APPROVED_AS_REQUESTED",
      reason: "Requested loan fits within the maximum 60% FOIR threshold.",
      eligibility_message:
        "The requested loan is eligible based on the information provided.",
      loan_reduction: 0,
    };
  }

  const allowedEmi = p.monthly_income * MAX_FOIR - existingObligations;

  if (allowedEmi <= 0) {
    return rejected(
      requestedFoir,
      "The requested loan is not eligible because existing EMI and house rent already consume the maximum permitted 60% of monthly income.",
      requestedFoir,
    );
  }

  const remainingMonths = (MAX_AGE - p.age) * 12;
  const maxPossibleTenure = remainingMonths <= 0 ? 1 : Math.min(MAX_TENURE, remainingMonths);

  const maxLoanRequestedTenure = calculateMaxLoan(allowedEmi, BENCHMARK_RATE, p.requested_tenure);
  const extendedTenure = Math.min(Math.max(p.requested_tenure, maxPossibleTenure), MAX_TENURE);
  const maxLoanExtended = calculateMaxLoan(allowedEmi, BENCHMARK_RATE, extendedTenure);

  let recommendedLoan: number;
  let recommendedTenure: number;

  if (maxLoanExtended > maxLoanRequestedTenure) {
    recommendedLoan = maxLoanExtended;
    recommendedTenure = extendedTenure;
  } else {
    recommendedLoan = maxLoanRequestedTenure;
    recommendedTenure = p.requested_tenure;
  }

  recommendedLoan = Math.floor(recommendedLoan / 1000) * 1000;

  if (recommendedLoan < 1000) {
    return rejected(
      requestedFoir,
      `The requested loan produces ${(requestedFoir * 100).toFixed(2)}% FOIR, which exceeds the maximum allowed 60%. No meaningful affordable loan amount could be calculated.`,
      requestedFoir,
    );
  }

  const recommendedEmi = calculateEmi(recommendedLoan, BENCHMARK_RATE, recommendedTenure);
  const finalFoir = (existingObligations + recommendedEmi) / p.monthly_income;

  return {
    is_eligible: true,
    decision_type: "COUNTER_OFFER",
    foir: finalFoir,
    requested_foir: requestedFoir,
    adjusted_loan: recommendedLoan,
    adjusted_tenure: recommendedTenure,
    estimated_emi: recommendedEmi,
    allowed_emi: allowedEmi,
    action_taken: "COUNTER_OFFER_PRINCIPAL_REDUCED",
    reason: `Requested loan produces ${(requestedFoir * 100).toFixed(2)}% FOIR, which exceeds the maximum allowed 60%. The maximum affordable loan is approximately ${inr(recommendedLoan)}.`,
    eligibility_message: `The requested loan is not eligible based on the information provided. A lower loan amount of approximately ${inr(recommendedLoan)} can fit within the 60% FOIR limit.`,
    loan_reduction: p.requested_loan - recommendedLoan,
  };
}

/* ---------------------------------------------------------------------------
 * Risk model (port of risk_ml_agent.py — same generative risk function that
 * produced loan_risk_dataset.csv, with additive per-feature contributions
 * used as SHAP-style explanations)
 * ------------------------------------------------------------------------ */

const RISK_BASELINE = {
  cibil_score: 720,
  foir: 0.5,
  monthly_income: 90000,
  age: 40,
};

export interface RiskResult {
  evaluated: boolean;
  risk_band: "LOW" | "MEDIUM" | "HIGH" | "NOT_EVALUATED";
  default_probability: number;
  shap_factors: ShapFactor[];
  message?: string;
}

export function evaluateRisk(
  p: LoanRequestInput,
  loanAmount: number,
  tenure: number,
  foir: number,
): RiskResult {
  if (loanAmount <= 0 || tenure <= 0) {
    return {
      evaluated: false,
      risk_band: "NOT_EVALUATED",
      default_probability: 0,
      shap_factors: [],
      message:
        "Risk assessment was not performed because the requested loan is not eligible.",
    };
  }

  const contributions: { feature: string; label: string; impact: number }[] = [
    {
      feature: "cibil_score",
      label: "CIBIL score",
      impact: -0.008 * (p.cibil_score - RISK_BASELINE.cibil_score),
    },
    { feature: "foir", label: "FOIR utilisation", impact: 4.2 * (foir - RISK_BASELINE.foir) },
    {
      feature: "monthly_income",
      label: "Monthly income",
      impact: -0.000015 * (p.monthly_income - RISK_BASELINE.monthly_income),
    },
    {
      feature: "age",
      label: "Age",
      impact: 0.025 * Math.max(0, p.age - 50),
    },
    {
      feature: "gender",
      label: "Applicant segment",
      impact: p.gender === "Female" ? -0.2 : 0,
    },
    {
      feature: "loan_amount",
      label: "Loan amount vs income",
      impact: 0.35 * (loanAmount / Math.max(p.monthly_income, 1) / 12 - 0.5),
    },
    {
      feature: "tenure_months",
      label: "Tenure",
      impact: 0.004 * (tenure - 36),
    },
    {
      feature: "existing_emi",
      label: "Existing obligations",
      impact: 1.6 * (p.existing_emi / Math.max(p.monthly_income, 1) - 0.15),
    },
  ];

  const logit = contributions.reduce((sum, c) => sum + c.impact, 0) - 0.2;
  const probability = 1 / (1 + Math.exp(-logit));

  const band = probability < 0.25 ? "LOW" : probability < 0.5 ? "MEDIUM" : "HIGH";

  const shap: ShapFactor[] = contributions
    .filter((c) => Math.abs(c.impact) > 0.0001)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
    .slice(0, 5)
    .map((c) => ({
      feature: c.feature,
      label: c.label,
      impact: Number(c.impact.toFixed(4)),
      direction: c.impact >= 0 ? "increases_risk" : "reduces_risk",
    }));

  return {
    evaluated: true,
    risk_band: band,
    default_probability: Number(probability.toFixed(4)),
    shap_factors: shap,
  };
}

/* ---------------------------------------------------------------------------
 * Policy + offer engine (port of policy_rag_agent.py / offer_discount_agent.py)
 * ------------------------------------------------------------------------ */

export const POLICY_LIBRARY = [
  "Women Borrowers Scheme: 0.10% discount on standard personal and home loan interest rates for female primary applicants.",
  "Youth Career Starter Program: Borrowers aged 21 to 29 years with salary above ₹40,000 qualify for a 0.20% rate discount.",
  "Senior and Pre-Retirement Limit: Borrowers aged 50 years and above must conclude loan tenure before age 60.",
  "Super Prime Credit Tier: CIBIL score equal to or above 780 gets a 0.35% interest concession.",
  "Zero Foreclosure Fee Policy: Zero penalty for early closure after 12 successful EMIs under applicable floating and personal loan tiers.",
];

export function computeDiscountedRate(p: {
  gender: Gender;
  age: number;
  monthly_income: number;
  cibil_score: number;
}): { final_rate: number; policies: AppliedPolicy[]; total_discount: number } {
  const policies: AppliedPolicy[] = [];

  if (p.gender.toLowerCase() === "female") {
    policies.push({
      policy_name: "Women Borrowers Scheme",
      discount_percentage: 0.1,
      justification: "Customer is a female primary applicant.",
    });
  }

  if (p.age >= 21 && p.age <= 29 && p.monthly_income > 40000) {
    policies.push({
      policy_name: "Youth Career Starter Program",
      discount_percentage: 0.2,
      justification:
        "Customer is between 21 and 29 years old and earns above ₹40,000 per month.",
    });
  }

  if (p.cibil_score >= 780) {
    policies.push({
      policy_name: "Super Prime Credit Tier",
      discount_percentage: 0.35,
      justification: "CIBIL score is at least 780.",
    });
  }

  let totalDiscount = policies.reduce((s, c) => s + c.discount_percentage, 0);
  totalDiscount = Math.min(totalDiscount, BENCHMARK_RATE - MIN_RATE);

  return {
    final_rate: Number((BENCHMARK_RATE - totalDiscount).toFixed(2)),
    policies,
    total_discount: Number(totalDiscount.toFixed(2)),
  };
}

/* ---------------------------------------------------------------------------
 * Amortisation + early closure (port of loan_simulator_agent.py)
 * ------------------------------------------------------------------------ */

export interface SimulationResult {
  is_simulatable: boolean;
  emi: number;
  total_interest: number;
  total_cost: number;
  closure_month: number;
  outstanding_principal: number;
  interest_paid_until_closure: number;
  interest_saved: number;
  total_repaid_with_closure: number;
  message: string;
}

export function simulateLoan(
  principal: number,
  rate: number,
  tenureMonths: number,
  earlyClosureMonth: number,
): SimulationResult {
  if (principal <= 0 || tenureMonths <= 0) {
    return {
      is_simulatable: false,
      emi: 0,
      total_interest: 0,
      total_cost: 0,
      closure_month: 0,
      outstanding_principal: 0,
      interest_paid_until_closure: 0,
      interest_saved: 0,
      total_repaid_with_closure: 0,
      message: "Loan simulation unavailable because the requested loan is not eligible.",
    };
  }

  const closureMonth = Math.min(Math.max(1, earlyClosureMonth), tenureMonths);
  const monthlyRate = rate / 12 / 100;
  const emi = calculateEmi(principal, rate, tenureMonths);

  let balance = principal;
  let totalInterest = 0;
  let balanceAtClosure = principal;
  let interestUntilClosure = 0;

  for (let month = 1; month <= tenureMonths; month++) {
    const interest = balance * monthlyRate;
    const principalComponent = Math.min(emi - interest, balance);
    balance = Math.max(0, balance - principalComponent);
    totalInterest += interest;
    if (month === closureMonth) {
      balanceAtClosure = balance;
      interestUntilClosure = totalInterest;
    }
  }

  const earlyClosureTotal = emi * closureMonth + balanceAtClosure;
  const interestSaved = Math.max(0, totalInterest - interestUntilClosure);

  return {
    is_simulatable: true,
    emi: Number(emi.toFixed(2)),
    total_interest: Number(totalInterest.toFixed(2)),
    total_cost: Number((principal + totalInterest).toFixed(2)),
    closure_month: closureMonth,
    outstanding_principal: Number(balanceAtClosure.toFixed(2)),
    interest_paid_until_closure: Number(interestUntilClosure.toFixed(2)),
    interest_saved: Number(interestSaved.toFixed(2)),
    total_repaid_with_closure: Number(earlyClosureTotal.toFixed(2)),
    message: "Early closure simulation calculated successfully.",
  };
}
