import type { AiExplanation, LoanEvaluationResponse } from "./types";

const SYSTEM_PROMPT = `You are the Senior Loan Advisory AI for CrediAdapt AI.

Explain the calculated loan recommendation clearly.

IMPORTANT RULES:
1. Never change numerical values.
2. Never invent bank policies.
3. Never claim guaranteed loan approval.
4. Explain FOIR using supplied calculations.
5. If eligibility is FALSE, clearly state: "The requested loan is not eligible based on the information provided."
6. If decision type is COUNTER_OFFER: state the requested amount is not eligible, explain the smaller recommended amount, and clarify this is a counter-offer, not approval of the requested amount.
7. If loan is REJECTED: do not discuss EMI savings as if the loan exists; explain why affordability failed.
8. Explain risk only when risk assessment exists.
9. Explain applicable concessions.
10. Explain early closure only when simulation exists.
11. Keep the explanation concise and customer-friendly.

Respond with ONLY a JSON object of the shape:
{"executive_summary":"...","affordability_rationale":"...","risk_and_pricing_rationale":"...","smart_prepayment_strategy":"..."}`;

function fallbackExplanation(r: LoanEvaluationResponse): AiExplanation {
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const inr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

  if (!r.is_eligible) {
    return {
      executive_summary:
        "The requested loan is not eligible based on the information provided.",
      affordability_rationale: `The requested loan of ${inr(r.requested.loan_amount)} produces a FOIR of ${pct(r.requested_foir)}, above the maximum permitted ${pct(r.max_foir)}. ${r.reason}`,
      risk_and_pricing_rationale:
        "Risk scoring and pricing were not performed because the application did not clear the affordability check.",
      smart_prepayment_strategy:
        "A prepayment plan can be prepared once an affordable loan structure is available.",
    };
  }

  return {
    executive_summary:
      r.decision_type === "APPROVED_AS_REQUESTED"
        ? `The requested loan of ${inr(r.recommended_loan)} over ${r.recommended_tenure} months fits within the affordability limit at an indicative rate of ${r.interest_rate}%.`
        : `The requested amount is not eligible. A counter-offer of ${inr(r.recommended_loan)} over ${r.recommended_tenure} months is recommended at an indicative rate of ${r.interest_rate}%. This is a counter-offer, not approval of the requested amount.`,
    affordability_rationale: `Existing obligations plus the proposed EMI of ${inr(r.emi)} give a FOIR of ${pct(r.final_foir)} against the maximum permitted ${pct(r.max_foir)}.`,
    risk_and_pricing_rationale: `The model places this application in the ${r.risk.risk_band} risk band with a modelled default probability of ${pct(r.risk.default_probability)}. Concessions applied total ${r.total_discount}% off the ${r.base_rate}% base rate.`,
    smart_prepayment_strategy: `Closing in month ${r.simulation.closure_month} leaves an outstanding principal of ${inr(r.simulation.outstanding_principal)} and saves approximately ${inr(r.simulation.interest_saved)} in interest.`,
  };
}

export async function generateExplanation(
  r: LoanEvaluationResponse,
): Promise<AiExplanation> {
  const isGoogle = Boolean(
    process.env["GOOGLE_API_KEY"] || process.env["GEMINI_API_KEY"],
  );
  const apiKey =
    process.env["GOOGLE_API_KEY"] ||
    process.env["GEMINI_API_KEY"] ||
    process.env["OPENAI_API_KEY"] ||
    process.env["AI_API_KEY"];
  if (!apiKey) return fallbackExplanation(r);

  const gatewayUrl =
    process.env["AI_GATEWAY_URL"] ||
    (isGoogle
      ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      : "https://api.openai.com/v1/chat/completions");

  const model =
    process.env["AI_MODEL"] ||
    (isGoogle ? "gemini-2.5-flash" : "gpt-4o-mini");

  const payload = {
    applicant: r.applicant,
    requested: r.requested,
    decision_type: r.decision_type,
    is_eligible: r.is_eligible,
    eligibility_message: r.eligibility_message,
    reason: r.reason,
    requested_foir_pct: Number((r.requested_foir * 100).toFixed(2)),
    final_foir_pct: Number((r.final_foir * 100).toFixed(2)),
    max_foir_pct: 60,
    recommended_loan: r.recommended_loan,
    recommended_tenure: r.recommended_tenure,
    interest_rate: r.interest_rate,
    emi: r.emi,
    risk: r.risk,
    policies: r.policies,
    simulation: r.simulation,
  };

  try {
    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) return fallbackExplanation(r);

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return fallbackExplanation(r);

    const parsed = JSON.parse(content) as Partial<AiExplanation>;
    const fb = fallbackExplanation(r);
    return {
      executive_summary: parsed.executive_summary || fb.executive_summary,
      affordability_rationale:
        parsed.affordability_rationale || fb.affordability_rationale,
      risk_and_pricing_rationale:
        parsed.risk_and_pricing_rationale || fb.risk_and_pricing_rationale,
      smart_prepayment_strategy:
        parsed.smart_prepayment_strategy || fb.smart_prepayment_strategy,
    };
  } catch {
    return fallbackExplanation(r);
  }
}
