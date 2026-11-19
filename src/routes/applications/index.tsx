import { Link, createFileRoute } from "@tanstack/react-router";
import { FormEvent, useEffect, useState } from "react";
import { Bell, Check, Download, FilePlus2, LogOut, RefreshCw } from "lucide-react";
import { ApplicationForm, DEFAULT_FORM } from "@/components/loan/ApplicationForm";
import { ResultsPanel } from "@/components/loan/ResultsPanel";
import { inr } from "@/components/loan/format";
import {
  apiRequest,
  downloadApplicationReport,
  RequireAuth,
  signOut,
  type AuthUser,
} from "@/lib/auth";
import type { ApplicationNotification, StoredApplication } from "@/lib/applications";
import type { LoanRequestInput } from "@/lib/loan/types";

export const Route = createFileRoute("/applications/")({ component: ApplicationsPage });

function ApplicationsPage() {
  return (
    <RequireAuth role="applicant">{(user) => <ApplicationsWorkspace user={user} />}</RequireAuth>
  );
}

function ApplicationsWorkspace({ user }: { user: AuthUser }) {
  const [form, setForm] = useState<LoanRequestInput>(DEFAULT_FORM);
  const [applications, setApplications] = useState<StoredApplication[]>([]);
  const [selected, setSelected] = useState<StoredApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [notifications, setNotifications] = useState<ApplicationNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const loadApplications = async () => {
    setLoading(true);
    try {
      const response = await apiRequest<{ items: StoredApplication[] }>("/api/applications");
      setApplications(response.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load your applications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadApplications();
    void apiRequest<{ items: ApplicationNotification[] }>("/api/notifications")
      .then((response) => setNotifications(response.items))
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : "Unable to load notifications."),
      );
  }, []);

  async function updateApplication(path: string, body?: unknown) {
    if (!selected) return;
    setError(null);
    setActionLoading(true);
    try {
      const updated = await apiRequest<StoredApplication>(path, {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setSelected(updated);
      setApplications((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setActionMessage("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the application.");
    } finally {
      setActionLoading(false);
    }
  }

  async function downloadReport(application: StoredApplication) {
    setError(null);
    setDownloading(true);
    try {
      await downloadApplicationReport(application.id, application.reference);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to download the report.");
    } finally {
      setDownloading(false);
    }
  }

  async function markNotificationRead(notification: ApplicationNotification) {
    try {
      await apiRequest(`/api/notifications/${notification.id}/read`, { method: "POST" });
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the notification.");
    }
  }

  async function submitApplication() {
    setError(null);
    setSubmitting(true);
    try {
      const application = await apiRequest<StoredApplication>("/api/recommendations", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setApplications((current) => [application, ...current]);
      setSelected(application);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit the application.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div>
            <Link to="/" className="font-bold tracking-tight text-sky-700">
              CrediAdapt AI
            </Link>
            <p className="text-sm text-slate-500">Applicant portal</p>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <p className="text-sm font-semibold">{user.full_name}</p>
              <p className="text-xs text-slate-500">Applicant</p>
            </div>
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen((open) => !open)}
                className="relative rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                aria-label="Notifications"
              >
                <Bell className="size-4" />
                {notifications.some((item) => !item.read) && (
                  <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-rose-500" />
                )}
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 text-left shadow-xl">
                  <p className="px-3 py-2 text-sm font-bold">Notifications</p>
                  {notifications.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-slate-500">You are all caught up.</p>
                  ) : (
                    notifications.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-start gap-2 rounded-lg p-3 text-sm ${item.read ? "text-slate-500" : "bg-sky-50 text-slate-800"}`}
                      >
                        <p className="flex-1">{item.message}</p>
                        {!item.read && (
                          <button
                            onClick={() => void markNotificationRead(item)}
                            aria-label="Mark notification as read"
                            className="rounded p-1 hover:bg-sky-100"
                          >
                            <Check className="size-4" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => void signOut().then(() => window.location.replace("/"))}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My applications</h1>
            <p className="mt-1 text-slate-600">
              Start a new loan assessment or review a submitted application.
            </p>
          </div>
          <button
            onClick={() => void loadApplications()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="size-4" /> Refresh
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="mt-7 grid gap-7 xl:grid-cols-[410px_1fr]">
          <div>
            <ApplicationForm
              value={form}
              onChange={setForm}
              onSubmit={() => void submitApplication()}
              onReset={() => {
                setForm(DEFAULT_FORM);
                setSelected(null);
              }}
              loading={submitting}
            />
          </div>
          <div className="min-w-0">
            {selected ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-600">
                    Assessment for {selected.reference}
                  </p>
                  <button
                    disabled={downloading}
                    onClick={() => void downloadReport(selected)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    <Download className="size-4" />
                    {downloading ? "Preparing…" : "Download report"}
                  </button>
                </div>
                <ApplicationTimeline application={selected} />
                <ApplicantActions
                  application={selected}
                  message={actionMessage}
                  setMessage={setActionMessage}
                  loading={actionLoading}
                  onRespond={(action, text) =>
                    void updateApplication(`/api/applications/${selected.id}/respond`, {
                      action,
                      ...(text ? { message: text } : {}),
                    })
                  }
                  onWithdraw={() =>
                    void updateApplication(`/api/applications/${selected.id}/withdraw`, {})
                  }
                />
                <ResultsPanel result={selected.result} />
              </div>
            ) : (
              <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <div>
                  <FilePlus2 className="mx-auto size-9 text-slate-400" />
                  <h2 className="mt-3 text-lg font-bold">Ready when you are</h2>
                  <p className="mt-1 max-w-md text-sm text-slate-500">
                    Complete the form to create a secure, persistent loan application. Your
                    assessment will appear here.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
        <section className="mt-10">
          <h2 className="text-xl font-bold">Submitted applications</h2>
          {loading ? (
            <p className="mt-4 text-sm text-slate-500">Loading applications…</p>
          ) : applications.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
              You have not submitted an application yet.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {applications.map((application) => (
                <article
                  key={application.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-sky-300 hover:shadow-md"
                >
                  <button
                    onClick={() => setSelected(application)}
                    className="w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs font-semibold text-slate-500">
                          {application.reference}
                        </p>
                        <p className="mt-2 text-lg font-bold">
                          {inr(
                            application.result.recommended_loan || application.input.requested_loan,
                          )}
                        </p>
                      </div>
                      <StatusChip status={application.status} />
                    </div>
                    <p className="mt-4 text-sm text-slate-600">
                      Requested {application.input.requested_tenure} months ·{" "}
                      {application.result.risk.risk_band} risk
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Submitted {new Date(application.created_at).toLocaleDateString("en-IN")}
                    </p>
                  </button>
                  <button
                    disabled={downloading}
                    onClick={() => void downloadReport(application)}
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:underline disabled:opacity-50"
                  >
                    <Download className="size-4" />
                    Download report
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700">
      {status.replaceAll("_", " ")}
    </span>
  );
}

function ApplicationTimeline({ application }: { application: StoredApplication }) {
  const history = application.status_history ?? [];
  return (
    <section
      aria-label="Application status history"
      className="rounded-xl border border-slate-200 bg-white p-5"
    >
      <h2 className="font-bold">Application timeline</h2>
      <ol className="mt-4 space-y-4">
        {history.map((entry, index) => (
          <li key={`${entry.to}-${index}`} className="flex gap-3">
            <span className="mt-1 size-2.5 shrink-0 rounded-full bg-sky-600" />
            <div>
              <p className="text-sm font-semibold">{entry.to.replaceAll("_", " ")}</p>
              <p className="text-xs text-slate-500">
                {new Date(entry.at).toLocaleString("en-IN")} · {entry.reason}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ApplicantActions({
  application,
  message,
  setMessage,
  loading,
  onRespond,
  onWithdraw,
}: {
  application: StoredApplication;
  message: string;
  setMessage: (value: string) => void;
  loading: boolean;
  onRespond: (
    action: "provide_info" | "accept_counter_offer" | "decline_counter_offer",
    message?: string,
  ) => void;
  onWithdraw: () => void;
}) {
  if (!["SUBMITTED", "INFO_REQUESTED", "COUNTER_OFFERED"].includes(application.status)) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Next steps</h2>
      {application.status === "INFO_REQUESTED" && (
        <div className="mt-3 space-y-3">
          <label className="block text-sm font-medium" htmlFor="applicant-response">
            Response to the officer
          </label>
          <textarea
            id="applicant-response"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 p-3 text-sm"
          />
          <button
            disabled={loading || !message.trim()}
            onClick={() => onRespond("provide_info", message.trim())}
            className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Send response
          </button>
        </div>
      )}
      {application.status === "COUNTER_OFFERED" && (
        <div className="mt-3">
          {application.counter_offer && (
            <p className="text-sm text-slate-600">
              Offer: {inr(application.counter_offer.amount)} ·{" "}
              {application.counter_offer.tenure_months} months ·{" "}
              {application.counter_offer.interest_rate}%
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={loading}
              onClick={() => onRespond("accept_counter_offer")}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Accept offer
            </button>
            <button
              disabled={loading}
              onClick={() => onRespond("decline_counter_offer")}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Decline offer
            </button>
          </div>
        </div>
      )}
      {["SUBMITTED", "INFO_REQUESTED", "COUNTER_OFFERED"].includes(application.status) && (
        <button
          disabled={loading}
          onClick={onWithdraw}
          className="mt-4 rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
        >
          Withdraw application
        </button>
      )}
    </section>
  );
}
