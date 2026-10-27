import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BadgePercent,
  BrainCircuit,
  FileText,
  Info,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LoanEvaluationResponse } from "@/lib/loan/types";
import { DecisionBanner } from "./DecisionBanner";
import { FoirGauge } from "./FoirGauge";
import { compactInr, inr, pct } from "./format";

function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "teal" | "amber" | "danger" | "success";
}) {
  const tone =
    accent === "teal"
      ? "text-sky-600 dark:text-sky-400"
      : accent === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : accent === "danger"
          ? "text-rose-600 dark:text-rose-400"
          : accent === "success"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-slate-900 dark:text-white";
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-2 font-mono text-2xl sm:text-3xl font-bold leading-tight ${tone}`}>{value}</p>
      {sub && <p className="mt-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 py-2.5 last:border-b-0">
      <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">{label}</span>
      <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

export function ResultsPanel({ result }: { result: LoanEvaluationResponse }) {
  const eligible = result.is_eligible;
  const s = result.simulation;

  const repaymentData = [
    { name: "Full Tenure", cost: s.total_cost },
    { name: `Closure @ M${s.closure_month}`, cost: s.total_repaid_with_closure },
  ];

  const shapData = result.risk.shap_factors.map((f) => ({
    name: f.label,
    impact: Number(f.impact.toFixed(3)),
  }));

  return (
    <div className="space-y-6">
      <DecisionBanner result={result} />

      {/* Engine Source Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex items-center gap-2.5">
          {result.engine_source === "python_multi_agent" ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
              </span>
              <div>
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  Python AI Multi-Agent Backend
                </span>
              </div>
            </>
          ) : (
            <>
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-500"></span>
              <div>
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  Standalone Evaluation Mode
                </span>
                <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-400">
                  Local Engine (Run: npm run server:python for Python AI)
                </span>
              </div>
            </>
          )}
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          ID: {result.applicant.customer_id}
        </span>
      </div>

      {eligible ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Metric
              label="Recommended Loan"
              value={inr(result.recommended_loan)}
              sub={
                result.recommended_loan !== result.requested.loan_amount
                  ? `Requested ${inr(result.requested.loan_amount)}`
                  : "Matches Requested Amount"
              }
              accent="teal"
            />
            <Metric
              label="Approved Interest Rate"
              value={`${result.interest_rate.toFixed(2)}%`}
              sub={`Base ${result.base_rate}% · ${result.total_discount}% Concession`}
            />
            <Metric label="Monthly EMI" value={inr(result.emi)} sub={`${result.recommended_tenure} Months Tenure`} />
            <Metric
              label="FOIR Utilisation"
              value={pct(result.final_foir)}
              sub="Max Permitted: 60%"
              accent={result.final_foir <= result.max_foir ? "success" : "danger"}
            />
            <Metric
              label="Default Probability"
              value={pct(result.risk.default_probability)}
              sub={`${result.risk.risk_band} Risk Tier`}
              accent={
                result.risk.risk_band === "LOW"
                  ? "success"
                  : result.risk.risk_band === "MEDIUM"
                    ? "amber"
                    : "danger"
              }
            />
            <Metric
              label="Total Repayment Cost"
              value={compactInr(s.total_cost)}
              sub={`Interest Component: ${compactInr(s.total_interest)}`}
            />
          </div>

          <FoirGauge
            requestedFoir={result.requested_foir}
            finalFoir={result.final_foir}
            maxFoir={result.max_foir}
          />
        </>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric label="Requested Loan" value={inr(result.requested.loan_amount)} />
            <Metric label="Requested FOIR" value={pct(result.requested_foir)} accent="danger" />
            <Metric label="Regulatory Max FOIR" value={pct(result.max_foir, 0)} />
          </div>
          <FoirGauge
            requestedFoir={result.requested_foir}
            finalFoir={result.requested_foir}
            maxFoir={result.max_foir}
          />
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-6 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30">
            <h3 className="text-lg font-bold text-rose-950 dark:text-rose-200">Underwriting Decline Rationale</h3>
            <p className="mt-2 text-sm font-medium text-rose-900 dark:text-rose-300">{result.reason}</p>
            <h4 className="mt-5 text-xs font-bold uppercase tracking-wider text-rose-800 dark:text-rose-400">Remediation Guidelines</h4>
            <ul className="mt-2 space-y-1.5 text-sm font-medium text-rose-900 dark:text-rose-300">
              <li>• Reduce the requested principal amount to fit within disposable income.</li>
              <li>• Settle or consolidate existing EMI obligations to bring baseline FOIR below 60%.</li>
              <li>• Extend loan tenure to lower the monthly instalment obligation.</li>
              <li>• Introduce a creditworthy co-applicant to enhance household debt capacity.</li>
            </ul>
          </div>
        </div>
      )}

      <Tabs defaultValue={eligible ? "offer" : "summary"} className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1.5 rounded-lg border border-slate-200 bg-slate-100 p-1.5 dark:border-slate-800 dark:bg-slate-800/80">
          {eligible && <TabsTrigger value="offer" className="rounded-md px-3.5 py-2 text-xs font-bold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm dark:text-slate-400 dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-white">Loan Offer</TabsTrigger>}
          {eligible && <TabsTrigger value="risk" className="rounded-md px-3.5 py-2 text-xs font-bold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm dark:text-slate-400 dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-white">Risk Explainability</TabsTrigger>}
          <TabsTrigger value="policies" className="rounded-md px-3.5 py-2 text-xs font-bold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm dark:text-slate-400 dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-white">Applied Policies</TabsTrigger>
          <TabsTrigger value="summary" className="rounded-md px-3.5 py-2 text-xs font-bold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm dark:text-slate-400 dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-white">Decision Summary</TabsTrigger>
          <TabsTrigger value="ai" className="rounded-md px-3.5 py-2 text-xs font-bold text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm dark:text-slate-400 dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-white">AI Compliance Narrative</TabsTrigger>
        </TabsList>

        {eligible && (
          <TabsContent value="offer" className="mt-4 rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <Row label="Monthly EMI" value={inr(result.emi)} />
                <Row label="Total Interest" value={inr(s.total_interest)} />
                <Row label="Total Repayment Cost" value={inr(s.total_cost)} />
                <Row label="Early Foreclosure Month" value={`Month ${s.closure_month}`} />
                <Row label="Principal at Foreclosure" value={inr(s.outstanding_principal)} />
                <Row label="Interest Saved via Prepayment" value={inr(s.interest_saved)} />
                <Row label="Net Repaid with Foreclosure" value={inr(s.total_repaid_with_closure)} />
              </div>
              <div className="h-64">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Full Tenure vs Early Foreclosure Cost
                </p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={repaymentData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} stroke="#64748b" />
                    <YAxis
                      tickFormatter={(v: number) => compactInr(v)}
                      tick={{ fontSize: 11, fontWeight: 600 }}
                      stroke="#64748b"
                      width={64}
                    />
                    <Tooltip
                      formatter={(v: number) => inr(v)}
                      contentStyle={{
                        background: "#0f172a",
                        color: "#ffffff",
                        border: "1px solid #334155",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    />
                    <Bar dataKey="cost" radius={[6, 6, 0, 0]}>
                      <Cell fill="#0284c7" />
                      <Cell fill="#38bdf8" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>
        )}

        {eligible && (
          <TabsContent value="risk" className="mt-4 rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <Row label="Risk Assessment Tier" value={result.risk.risk_band} />
                <Row label="Default Probability" value={pct(result.risk.default_probability)} />
                <div className="mt-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Risk Spectrum</p>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full transition-[width] duration-700 ${
                        result.risk.risk_band === "LOW"
                          ? "bg-emerald-500"
                          : result.risk.risk_band === "MEDIUM"
                            ? "bg-amber-500"
                            : "bg-rose-500"
                      }`}
                      style={{
                        width: `${Math.min(100, result.risk.default_probability * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span>Low Risk (0-15%)</span>
                    <span>Medium Risk (15-35%)</span>
                    <span>High Risk (&gt;35%)</span>
                  </div>
                </div>
                <p className="mt-5 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <Info className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
                  Statistical machine-learning estimate calibrated against historical portfolio performance.
                </p>
              </div>
              <div className="h-64">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  SHAP Feature Attribution (Positive = Increases Risk)
                </p>
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart
                    layout="vertical"
                    data={shapData}
                    margin={{ top: 4, right: 12, bottom: 0, left: 8 }}
                  >
                    <XAxis type="number" tick={{ fontSize: 11, fontWeight: 600 }} stroke="#64748b" />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={130}
                      tick={{ fontSize: 11, fontWeight: 600 }}
                      stroke="#64748b"
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        color: "#ffffff",
                        border: "1px solid #334155",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    />
                    <Bar dataKey="impact" radius={4}>
                      {shapData.map((d, i) => (
                        <Cell key={i} fill={d.impact >= 0 ? "#f43f5e" : "#10b981"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </TabsContent>
        )}

        <TabsContent value="policies" className="mt-4 rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
          {result.policies.length === 0 ? (
            <div className="py-10 text-center">
              <BadgePercent className="mx-auto size-6 text-slate-400 dark:text-slate-500" aria-hidden />
              <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
                No policy concessions apply to this profile.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {result.policies.map((p) => (
                <li
                  key={p.policy_name}
                  className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-800/50"
                >
                  <div>
                    <p className="text-base font-bold text-slate-900 dark:text-slate-100">{p.policy_name}</p>
                    <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">{p.justification}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-mono text-sm font-bold text-sky-700 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                    −{p.discount_percentage.toFixed(2)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="summary" className="mt-4 rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Applicant Profile</p>
              <Row label="Customer Reference" value={result.applicant.customer_id} />
              <Row label="Age" value={`${result.applicant.age} Years`} />
              <Row label="Gender" value={result.applicant.gender} />
              <Row label="Bureau Score" value={String(result.applicant.cibil_score)} />
              <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Financial Baseline</p>
              <Row label="Monthly Gross Income" value={inr(result.applicant.monthly_income)} />
              <Row label="House Rent Commitment" value={inr(result.applicant.house_rent)} />
              <Row label="Existing Debt Servicing" value={inr(result.applicant.existing_emi)} />
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Underwriting Sanction</p>
              <Row label="Requested Loan" value={inr(result.requested.loan_amount)} />
              <Row label="Requested Tenure" value={`${result.requested.tenure_months} Months`} />
              <Row
                label="Approved Loan Principal"
                value={eligible ? inr(result.recommended_loan) : "—"}
              />
              <Row
                label="Approved Tenure"
                value={eligible ? `${result.recommended_tenure} Months` : "—"}
              />
              <Row label="Initial Requested FOIR" value={pct(result.requested_foir)} />
              <Row label="Final Sanction FOIR" value={eligible ? pct(result.final_foir) : "—"} />
              <Row label="Decision Outcome" value={result.decision_type.replaceAll("_", " ")} />
              <Row
                label="Sanction Interest Rate"
                value={eligible ? `${result.interest_rate.toFixed(2)}%` : "—"}
              />
              <Row label="Monthly Instalment (EMI)" value={eligible ? inr(result.emi) : "—"} />
              <Row
                label="Risk Rating"
                value={
                  result.risk.evaluated
                    ? `${result.risk.risk_band} (${pct(result.risk.default_probability)})`
                    : "Not Evaluated"
                }
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ai" className="mt-4 rounded-xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
          <div className="space-y-6">
            {[
              { icon: Sparkles, title: "Executive Decision Summary", body: result.explanation.executive_summary },
              { icon: FileText, title: "Affordability & Debt Capacity Rationale", body: result.explanation.affordability_rationale },
              { icon: BrainCircuit, title: "Risk Scoring & Pricing Strategy", body: result.explanation.risk_and_pricing_rationale },
              { icon: ScrollText, title: "Foreclosure & Early Repayment Strategy", body: result.explanation.smart_prepayment_strategy },
            ].map(({ icon: Icon, title, body }) => (
              <section key={title} className="rounded-lg border border-slate-100 bg-slate-50/50 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-800/40">
                <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
                  <Icon className="size-4 text-sky-600 dark:text-sky-400" aria-hidden />
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed font-medium text-slate-700 dark:text-slate-300">{body}</p>
              </section>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
