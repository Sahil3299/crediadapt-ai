import { runLoanPipeline } from "../src/lib/loan/pipeline.server";
import { loanRequestSchema } from "../src/lib/loan/evaluate.functions";

const case1 = {
  monthly_income: 95000,
  age: 27,
  gender: "Female" as const,
  house_rent: 18000,
  existing_emi: 8000,
  cibil_score: 795,
  requested_loan: 500000,
  requested_tenure: 36,
  early_closure_month: 18
};

const case2 = {
  monthly_income: 45000,
  age: 34,
  gender: "Male" as const,
  house_rent: 16000,
  existing_emi: 9000,
  cibil_score: 670,
  requested_loan: 600000,
  requested_tenure: 36,
  early_closure_month: 18
};

const case3 = {
  monthly_income: 30000,
  age: 40,
  gender: "Male" as const,
  house_rent: 15000,
  existing_emi: 10000,
  cibil_score: 600,
  requested_loan: 500000,
  requested_tenure: 36,
  early_closure_month: 12
};

async function run() {
  console.log("--- CASE 1 (Approved) ---");
  const res1 = await runLoanPipeline(case1);
  console.log("Decision:", res1.decision_type);
  console.log("EMI:", res1.emi);
  console.log("Risk Band:", res1.risk.risk_band);
  console.log("Default Prob:", res1.risk.default_probability);
  console.log("SHAP Factors count:", res1.risk.shap_factors.length);
  console.log("Policies count:", res1.policies.length);
  console.log("Simulation is_simulatable:", res1.simulation.is_simulatable);
  console.log("Simulation closure month:", res1.simulation.closure_month);
  console.log("Simulation interest saved:", res1.simulation.interest_saved);

  console.log("\n--- CASE 2 (Counter-offer) ---");
  const res2 = await runLoanPipeline(case2);
  console.log("Decision:", res2.decision_type);
  console.log("Recommended Loan:", res2.recommended_loan);
  console.log("Recommended Tenure:", res2.recommended_tenure);
  console.log("EMI:", res2.emi);
  console.log("Risk Band:", res2.risk.risk_band);
  console.log("Default Prob:", res2.risk.default_probability);
  console.log("Simulation is_simulatable:", res2.simulation.is_simulatable);

  console.log("\n--- CASE 3 (Rejected) ---");
  const res3 = await runLoanPipeline(case3);
  console.log("Decision:", res3.decision_type);
  console.log("Is Eligible:", res3.is_eligible);
  console.log("Recommended Loan:", res3.recommended_loan);
  console.log("EMI:", res3.emi);
  console.log("Risk Evaluated:", res3.risk.evaluated);
  console.log("Risk Band:", res3.risk.risk_band);
  console.log("Simulation is_simulatable:", res3.simulation.is_simulatable);
}

run().catch(console.error);
