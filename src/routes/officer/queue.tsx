import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, LogOut, RefreshCw, Search, X } from "lucide-react";
import { inr } from "@/components/loan/format";
import {
  apiRequest,
  downloadApplicationReport,
  RequireAuth,
  signOut,
  type AuthUser,
} from "@/lib/auth";
import type { ApplicationStatus, StoredApplication } from "@/lib/applications";

export const Route = createFileRoute("/officer/queue")({ component: OfficerQueue });

const STATUSES: ApplicationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "INFO_REQUESTED",
  "APPROVED",
  "REJECTED",
  "COUNTER_OFFERED",
  "ACCEPTED",
  "WITHDRAWN",
];

interface ApplicantSummary {
  id: string;
  email: string;
  full_name: string;
  role: "applicant";
}

interface AuditEntry {
  timestamp: string;
  actor_id: string;
  actor_role: string;
  action: string;
  application_id: string | null;
  details: Record<string, unknown>;
}

interface OfficerAnalytics {
  total_applications: number;
  status_counts: Record<string, number>;
  risk_mix: Record<string, number>;
  approval_rate: number | null;
  approval_rate_by_risk: Record<string, number | null>;
  average_hours_to_decision: number | null;
}

interface QueueFilters {
  status?: string;
  riskBand?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

function OfficerQueue() {
  return <RequireAuth role="officer">{(user) => <QueueWorkspace user={user} />}</RequireAuth>;
}

function QueueWorkspace({ user }: { user: AuthUser }) {
  const [applications, setApplications] = useState<StoredApplication[]>([]);
  const [selected, setSelected] = useState<StoredApplication | null>(null);
  const [applicant, setApplicant] = useState<ApplicantSummary | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [analytics, setAnalytics] = useState<OfficerAnalytics | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<"approve" | "reject" | "counter_offer" | "request_info">(
    "approve",
  );
  const [counterAmount, setCounterAmount] = useState("");
  const [counterTenure, setCounterTenure] = useState("");
  const [counterRate, setCounterRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const loadQueue = useCallback(async (filters: QueueFilters = {}) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.riskBand) params.set("risk_band", filters.riskBand);
    if (filters.search?.trim()) params.set("search", filters.search.trim());
    if (filters.dateFrom) params.set("date_from", `${filters.dateFrom}T00:00:00Z`);
    if (filters.dateTo) params.set("date_to", `${filters.dateTo}T23:59:59Z`);
    try {
      const query = params.toString();
      const suffix = query ? `?${query}` : "";
      const response = await apiRequest<{ items: StoredApplication[] }>(
        `/api/officer/queue${suffix}`,
      );
      setApplications(response.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  function activeFilters(): QueueFilters {
    return { status: statusFilter, riskBand: riskFilter, search, dateFrom, dateTo };
  }

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    void apiRequest<OfficerAnalytics>("/api/officer/analytics")
      .then(setAnalytics)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Unable to load analytics."),
      );
  }, []);

  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selected]);

  async function openApplication(application: StoredApplication) {
    setSelected(application);
    setApplicant(null);
    setAuditEntries([]);
    setReason("");
    setError(null);
    try {
      const detail = await apiRequest<{
        application: StoredApplication;
        applicant: ApplicantSummary | null;
      }>(`/api/officer/applications/${application.id}`);
      setSelected(detail.application);
      setApplicant(detail.applicant);
      const audit = await apiRequest<{ items: AuditEntry[] }>(
        `/api/audit?application_id=${application.id}`,
      );
      setAuditEntries(audit.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load application details.");
    }
  }

  function replaceApplication(updated: StoredApplication) {
    setApplications((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setSelected(updated);
  }

  async function startReview() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiRequest<StoredApplication>(
        `/api/officer/applications/${selected.id}/start-review`,
        { method: "POST" },
      );
      replaceApplication(updated);
      await openApplication(updated);
      await loadQueue(activeFilters());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start review.");
    } finally {
      setSaving(false);
    }
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    const counter_offer =
      action === "counter_offer"
        ? {
            amount: Number(counterAmount),
            tenure_months: Number(counterTenure),
            interest_rate: Number(counterRate),
          }
        : undefined;
    try {
      const updated = await apiRequest<StoredApplication>(
        `/api/officer/applications/${selected.id}/decision`,
        {
          method: "POST",
          body: JSON.stringify({
            action,
            reason: reason.trim(),
            ...(counter_offer ? { counter_offer } : {}),
          }),
        },
      );
      replaceApplication(updated);
      await openApplication(updated);
      await loadQueue(activeFilters());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit the decision.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadReport() {
    if (!selected) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadApplicationReport(selected.id, selected.reference);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to download the report.");
    } finally {
      setDownloading(false);
    }
  }

  const summary = useMemo(
    () => ({
      submitted:
        analytics?.status_counts["SUBMITTED"] ??
        applications.filter((item) => item.status === "SUBMITTED").length,
      review:
        analytics?.status_counts["UNDER_REVIEW"] ??
        applications.filter((item) => item.status === "UNDER_REVIEW").length,
      highRisk:
        analytics?.risk_mix["HIGH"] ??
        applications.filter((item) => item.result.risk.risk_band === "HIGH").length,
    }),
    [analytics, applications],
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div>
            <Link to="/" className="font-bold text-sky-400">
              CrediAdapt AI
            </Link>
            <p className="text-sm text-slate-400">Officer workspace</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold">{user.full_name}</p>
              <p className="text-xs text-slate-400">Loan officer</p>
            </div>
            <button
              onClick={() => void signOut().then(() => window.location.replace("/"))}
              aria-label="Sign out"
              className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Application queue</h1>
            <p className="mt-1 text-slate-400">
              Review applications, record decisions, and track each status change.
            </p>
          </div>
          <button
            onClick={() => void loadQueue(activeFilters())}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-800"
          >
            <RefreshCw className="size-4" /> Refresh
          </button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <SummaryCard
            label="Total applications"
            value={analytics?.total_applications ?? applications.length}
          />
          <SummaryCard label="Awaiting review" value={summary.submitted} />
          <SummaryCard label="In review" value={summary.review} />
          <SummaryCard label="High risk in results" value={summary.highRisk} />
          <SummaryCard
            label="Approval rate"
            value={
              analytics?.approval_rate == null
                ? "—"
                : `${(analytics.approval_rate * 100).toFixed(1)}%`
            }
          />
          <SummaryCard
            label="Avg. hours to decision"
            value={
              analytics?.average_hours_to_decision == null
                ? "—"
                : analytics.average_hours_to_decision.toFixed(1)
            }
          />
        </div>
        {analytics && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <AnalyticsBars title="Applications by status" entries={analytics.status_counts} />
            <AnalyticsBars title="Risk mix" entries={analytics.risk_mix} />
          </div>
        )}
        {analytics && <ApprovalRates entries={analytics.approval_rate_by_risk} />}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void loadQueue(activeFilters());
          }}
          className="mt-6 grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-3 xl:grid-cols-6"
        >
          <label className="text-xs font-semibold text-slate-400">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">All statuses</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-400">
            Risk band
            <select
              value={riskFilter}
              onChange={(event) => setRiskFilter(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">All risk</option>
              <option>LOW</option>
              <option>MEDIUM</option>
              <option>HIGH</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-400">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs font-semibold text-slate-400">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs font-semibold text-slate-400 md:col-span-2">
            Search reference / applicant
            <div className="mt-1 flex rounded-lg border border-slate-700 bg-slate-950">
              <Search className="m-2.5 size-4 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Reference, name, or email"
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-slate-100 outline-none"
              />
            </div>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500 md:col-span-3 xl:col-span-6"
          >
            Apply filters
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-5 rounded-xl bg-rose-950/60 p-4 text-sm text-rose-200">
            {error}
          </p>
        )}
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          {loading ? (
            <p className="p-6 text-sm text-slate-400">Loading queue…</p>
          ) : applications.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">No applications match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="sticky top-0 bg-slate-800/90 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Reference</th>
                    <th className="px-5 py-3">Applicant</th>
                    <th className="px-5 py-3">Request</th>
                    <th className="px-5 py-3">AI result</th>
                    <th className="px-5 py-3">Risk</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Review</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((application) => (
                    <tr key={application.id} className="border-t border-slate-800">
                      <td className="px-5 py-4 font-mono text-xs">{application.reference}</td>
                      <td className="px-5 py-4">
                        <span className="block">
                          {application.applicant_name ?? application.applicant_id.slice(0, 8)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {application.applicant_email}
                        </span>
                      </td>
                      <td className="px-5 py-4">{inr(application.input.requested_loan)}</td>
                      <td className="px-5 py-4">{inr(application.result.recommended_loan)}</td>
                      <td className="px-5 py-4">{application.result.risk.risk_band}</td>
                      <td className="px-5 py-4">
                        <StatusBadge status={application.status} />
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => void openApplication(application)}
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-800"
                        >
                          Open review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      {selected && (
        <div
          className="fixed inset-0 z-30 flex justify-end bg-black/60"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
            className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-700 bg-slate-950 p-5 shadow-2xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-slate-400">{selected.reference}</p>
                <h2 id="review-title" className="mt-1 text-2xl font-bold">
                  Application review
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {applicant?.full_name ?? "Applicant"}
                  {applicant?.email ? ` · ${applicant.email}` : ""}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close review"
                className="rounded-lg border border-slate-700 p-2 hover:bg-slate-800"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Detail label="Requested" value={inr(selected.input.requested_loan)} />
              <Detail label="AI recommendation" value={inr(selected.result.recommended_loan)} />
              <Detail label="AI risk band" value={selected.result.risk.risk_band} />
              <Detail label="Status" value={selected.status.replaceAll("_", " ")} />
            </div>
            <section className="mt-5 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h3 className="font-bold">Applicant profile</h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Detail label="Monthly income" value={inr(selected.input.monthly_income)} />
                <Detail label="Age" value={`${selected.input.age} years`} />
                <Detail label="Monthly expenses" value={inr(selected.input.house_rent)} />
                <Detail label="Existing EMI" value={inr(selected.input.existing_emi)} />
                <Detail label="CIBIL score" value={String(selected.input.cibil_score)} />
                <Detail label="Gender (policy only)" value={selected.input.gender} />
              </div>
            </section>
            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h3 className="font-bold">AI explanation</h3>
              <p className="mt-2 text-sm text-slate-300">
                {selected.result.explanation.executive_summary}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                {selected.result.reason}
              </p>
            </div>
            {selected.result.risk.shap_factors.length > 0 && (
              <section className="mt-5 rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h3 className="font-bold">Risk model factors</h3>
                <ul className="mt-2 space-y-2">
                  {selected.result.risk.shap_factors.map((factor) => (
                    <li
                      key={factor.feature}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span>{factor.label}</span>
                      <span
                        className={
                          factor.direction === "increases_risk"
                            ? "text-rose-300"
                            : "text-emerald-300"
                        }
                      >
                        {factor.direction.replaceAll("_", " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {selected.result.policies.length > 0 && (
              <section className="mt-5 rounded-xl border border-slate-800 bg-slate-900 p-4">
                <h3 className="font-bold">Applied policies</h3>
                <ul className="mt-2 space-y-2">
                  {selected.result.policies.map((policy) => (
                    <li key={policy.policy_name} className="text-sm">
                      <p className="font-semibold">
                        {policy.policy_name} · {policy.discount_percentage}%
                      </p>
                      <p className="text-xs text-slate-400">{policy.justification}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {selected.status === "SUBMITTED" && (
              <button
                disabled={saving}
                onClick={() => void startReview()}
                className="mt-5 w-full rounded-lg bg-sky-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? "Starting…" : "Start review"}
              </button>
            )}
            {selected.status === "UNDER_REVIEW" && (
              <form
                onSubmit={(event) => void submitDecision(event)}
                className="mt-5 space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4"
              >
                <h3 className="font-bold">Record a decision</h3>
                <label className="block text-xs font-semibold text-slate-400">
                  Action
                  <select
                    value={action}
                    onChange={(event) => setAction(event.target.value as typeof action)}
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="approve">Approve</option>
                    <option value="reject">Reject</option>
                    <option value="counter_offer">Counter-offer</option>
                    <option value="request_info">Request information</option>
                  </select>
                </label>
                {action === "counter_offer" && (
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-xs text-slate-400">
                      Amount
                      <input
                        required
                        type="number"
                        min="1"
                        value={counterAmount}
                        onChange={(event) => setCounterAmount(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100"
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      Tenure
                      <input
                        required
                        type="number"
                        min="6"
                        max="84"
                        value={counterTenure}
                        onChange={(event) => setCounterTenure(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100"
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      Rate %
                      <input
                        required
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        value={counterRate}
                        onChange={(event) => setCounterRate(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-slate-100"
                      />
                    </label>
                  </div>
                )}
                <label className="block text-xs font-semibold text-slate-400">
                  Reason / note
                  <textarea
                    required
                    minLength={1}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </label>
                <button
                  disabled={saving}
                  className="w-full rounded-lg bg-sky-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Submit decision"}
                </button>
              </form>
            )}
            <button
              disabled={downloading}
              onClick={() => void downloadReport()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              <Download className="size-4" />
              {downloading ? "Preparing report…" : "Download report"}
            </button>
            <section className="mt-6">
              <h3 className="font-bold">Status history</h3>
              <ol className="mt-3 space-y-3">
                {(selected.status_history ?? []).map((entry, index) => (
                  <li key={`${entry.to}-${index}`} className="border-l-2 border-sky-500 pl-3">
                    <p className="text-sm font-semibold">{entry.to.replaceAll("_", " ")}</p>
                    <p className="text-xs text-slate-400">
                      {entry.reason} · {new Date(entry.at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
            <section className="mt-6">
              <h3 className="font-bold">Audit trail</h3>
              {auditEntries.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No audit entries are available.</p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {auditEntries.map((entry, index) => (
                    <li key={`${entry.action}-${index}`} className="rounded-lg bg-slate-900 p-3">
                      <p className="text-sm font-semibold">{entry.action.replaceAll("_", " ")}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {entry.actor_role} · {new Date(entry.timestamp).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function AnalyticsBars({ title, entries }: { title: string; entries: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(entries));
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-sm font-bold">{title}</h2>
      <ul className="mt-3 space-y-2">
        {Object.entries(entries).map(([label, count]) => (
          <li key={label} className="grid grid-cols-[120px_1fr_30px] items-center gap-2 text-xs">
            <span className="truncate text-slate-400">{label.replaceAll("_", " ")}</span>
            <span className="h-2 overflow-hidden rounded-full bg-slate-800">
              <span
                className="block h-full rounded-full bg-sky-500"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </span>
            <span className="text-right tabular-nums">{count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ApprovalRates({ entries }: { entries: Record<string, number | null> }) {
  return (
    <section className="mt-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-sm font-bold">Approval rate by risk band</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {["LOW", "MEDIUM", "HIGH"].map((band) => {
          const rate = entries[band];
          return (
            <div key={band} className="rounded-lg bg-slate-950 p-3">
              <p className="text-xs font-semibold text-slate-400">{band} risk</p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {rate == null ? "—" : `${(rate * 100).toFixed(1)}%`}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-mono text-sm font-bold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-sky-950 px-2.5 py-1 text-xs font-semibold text-sky-300">
      {status.replaceAll("_", " ")}
    </span>
  );
}
