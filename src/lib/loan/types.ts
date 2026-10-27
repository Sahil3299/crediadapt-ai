export type Gender = "Female" | "Male" | "Other";

export interface LoanRequestInput {
  monthly_income: number;
  age: number;
  gender: Gender;
  house_rent: number;
  existing_emi: number;
  cibil_score: number;
  requested_loan: number;
  requested_tenure: number;
  early_closure_month: number;
}

export type DecisionType = "APPROVED_AS_REQUESTED" | "COUNTER_OFFER" | "REJECTED";

export interface ShapFactor {
  feature: string;
  label: string;
  impact: number;
  direction: "increases_risk" | "reduces_risk";
}

export interface AppliedPolicy {
  policy_name: string;
  discount_percentage: number;
  justification: string;
}

export interface AiExplanation {
  executive_summary: string;
  affordability_rationale: string;
  risk_and_pricing_rationale: string;
  smart_prepayment_strategy: string;
}

export interface LoanEvaluationResponse {
  applicant: {
    customer_id: string;
    monthly_income: number;
    age: number;
    gender: Gender;
    house_rent: number;
    existing_emi: number;
    cibil_score: number;
  };
  requested: {
    loan_amount: number;
    tenure_months: number;
    early_closure_month: number;
  };
  decision_type: DecisionType;
  is_eligible: boolean;
  eligibility_message: string;
  reason: string;
  requested_foir: number;
  final_foir: number;
  max_foir: number;
  recommended_loan: number;
  recommended_tenure: number;
  interest_rate: number;
  base_rate: number;
  emi: number;
  risk: {
    evaluated: boolean;
    risk_band: "LOW" | "MEDIUM" | "HIGH" | "NOT_EVALUATED";
    default_probability: number;
    shap_factors: ShapFactor[];
    message?: string;
  };
  policies: AppliedPolicy[];
  total_discount: number;
  simulation: {
    is_simulatable: boolean;
    total_interest: number;
    total_cost: number;
    closure_month: number;
    outstanding_principal: number;
    interest_paid_until_closure: number;
    interest_saved: number;
    total_repaid_with_closure: number;
    message: string;
  };
  explanation: AiExplanation;
  engine_source?: "python_multi_agent" | "standalone_ts";
}

export interface BackendHealthStatus {
  python_connected: boolean;
  agents_count: number;
  message: string;
}
