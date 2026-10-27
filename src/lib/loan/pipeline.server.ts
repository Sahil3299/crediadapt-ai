import {
  MAX_FOIR,
  BENCHMARK_RATE,
  assessAffordability,
  computeDiscountedRate,
  evaluateRisk,
  simulateLoan,
} from "./engine";
import { generateExplanation } from "./explanation.server";
import type { BackendHealthStatus, LoanEvaluationResponse, LoanRequestInput } from "./types";

let counter = 0;

const PYTHON_BACKEND_URL =
  process.env["PYTHON_BACKEND_URL"] || "http://127.0.0.1:8000/api/evaluate-loan";
const PYTHON_HEALTH_URL =
  process.env["PYTHON_HEALTH_URL"] || "http://127.0.0.1:8000/api/health";

export async function getBackendHealth(): Promise<BackendHealthStatus> {
  try {
    const res = await fetch(PYTHON_HEALTH_URL, {
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      const data = (await res.json()) as { status?: string; agents_count?: number };
      return {
        python_connected: true,
        agents_count: data.agents_count || 7,
        message: "Python Multi-Agent API is active",
      };
    }
  } catch {
    // Offline
  }
  return {
    python_connected: false,
    agents_count: 0,
    message: "Python server offline — Standalone mode active",
  };
}

async function callPythonBackend(
  input: LoanRequestInput,
): Promise<LoanEvaluationResponse | null> {
  try {
    const res = await fetch(PYTHON_BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const parsed = (await res.json()) as LoanEvaluationResponse;
      parsed.engine_source = "python_multi_agent";
      return parsed;
    }
  } catch (e) {
    console.warn("Python backend request failed or timed out:", e);
  }
  return null;
}

export async function runLoanPipeline(
  input: LoanRequestInput,
): Promise<LoanEvaluationResponse> {
  // 1. Try Python Multi-Agent Backend
  const pythonResult = await callPythonBackend(input);
  if (pythonResult) {
    return pythonResult;
  }

  // 2. Fallback to Local Underwriting Pipeline
  counter += 1;
  const customerId = `APPL-${String(1000 + (counter % 9000)).padStart(4, "0")}`;

  const affordability = assessAffordability(input);

  const risk = evaluateRisk(
    input,
    affordability.adjusted_loan,
    affordability.adjusted_tenure,
    affordability.foir,
  );

  const offer = computeDiscountedRate(input);

  const simulation = simulateLoan(
    affordability.adjusted_loan,
    offer.final_rate,
    affordability.adjusted_tenure,
    input.early_closure_month,
  );

  const response: LoanEvaluationResponse = {
    applicant: {
      customer_id: customerId,
      monthly_income: input.monthly_income,
      age: input.age,
      gender: input.gender,
      house_rent: input.house_rent,
      existing_emi: input.existing_emi,
      cibil_score: input.cibil_score,
    },
    requested: {
      loan_amount: input.requested_loan,
      tenure_months: input.requested_tenure,
      early_closure_month: input.early_closure_month,
    },
    decision_type: affordability.decision_type,
    is_eligible: affordability.is_eligible,
    eligibility_message: affordability.eligibility_message,
    reason: affordability.reason,
    requested_foir: Number(affordability.requested_foir.toFixed(4)),
    final_foir: Number(affordability.foir.toFixed(4)),
    max_foir: MAX_FOIR,
    recommended_loan: affordability.adjusted_loan,
    recommended_tenure: affordability.adjusted_tenure,
    interest_rate: affordability.is_eligible ? offer.final_rate : 0,
    base_rate: BENCHMARK_RATE,
    emi: simulation.emi,
    risk,
    policies: offer.policies,
    total_discount: offer.total_discount,
    simulation,
    explanation: {
      executive_summary: "",
      affordability_rationale: "",
      risk_and_pricing_rationale: "",
      smart_prepayment_strategy: "",
    },
    engine_source: "standalone_ts",
  };

  response.explanation = await generateExplanation(response);
  return response;
}
