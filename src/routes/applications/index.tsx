import { Link, createFileRoute } from "@tanstack/react-router";
import { FormEvent, useEffect, useState } from "react";
import { FilePlus2, LogOut, RefreshCw } from "lucide-react";
import { ApplicationForm, DEFAULT_FORM } from "@/components/loan/ApplicationForm";
import { ResultsPanel } from "@/components/loan/ResultsPanel";
import { inr } from "@/components/loan/format";
import { apiRequest, RequireAuth, signOut, type AuthUser } from "@/lib/auth";
import type { StoredApplication } from "@/lib/applications";
import type { LoanRequestInput } from "@/lib/loan/types";

export const Route = createFileRoute("/applications/")({ component: ApplicationsPage });

function ApplicationsPage() {
  return <RequireAuth role="applicant">{(user) => <ApplicationsWorkspace user={user} />}</RequireAuth>;
}

function ApplicationsWorkspace({ user }: { user: AuthUser }) {
  const [form, setForm] = useState<LoanRequestInput>(DEFAULT_FORM);
  const [applications, setApplications] = useState<StoredApplication[]>([]);
  const [selected, setSelected] = useState<StoredApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

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

  return <main className="min-h-screen bg-slate-50 text-slate-900"><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4"><div><Link to="/" className="font-bold tracking-tight text-sky-700">CrediAdapt AI</Link><p className="text-sm text-slate-500">Applicant portal</p></div><div className="flex items-center gap-3 text-right"><div><p className="text-sm font-semibold">{user.full_name}</p><p className="text-xs text-slate-500">Applicant</p></div><button onClick={() => void signOut().then(() => window.location.replace("/"))} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Sign out"><LogOut className="size-4" /></button></div></div></header><div className="mx-auto max-w-7xl px-5 py-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-bold tracking-tight">My applications</h1><p className="mt-1 text-slate-600">Start a new loan assessment or review a submitted application.</p></div><button onClick={() => void loadApplications()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="size-4" /> Refresh</button></div>{error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}<div className="mt-7 grid gap-7 xl:grid-cols-[410px_1fr]"><div><ApplicationForm value={form} onChange={setForm} onSubmit={() => void submitApplication()} onReset={() => { setForm(DEFAULT_FORM); setSelected(null); }} loading={submitting} /></div><div className="min-w-0">{selected ? <div className="space-y-3"><p className="text-sm font-semibold text-slate-600">Assessment for {selected.reference}</p><ResultsPanel result={selected.result} /></div> : <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><FilePlus2 className="mx-auto size-9 text-slate-400" /><h2 className="mt-3 text-lg font-bold">Ready when you are</h2><p className="mt-1 max-w-md text-sm text-slate-500">Complete the form to create a secure, persistent loan application. Your assessment will appear here.</p></div></div>}</div></div><section className="mt-10"><h2 className="text-xl font-bold">Submitted applications</h2>{loading ? <p className="mt-4 text-sm text-slate-500">Loading applications…</p> : applications.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">You have not submitted an application yet.</p> : <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{applications.map((application) => <button key={application.id} onClick={() => setSelected(application)} className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-sky-300 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-semibold text-slate-500">{application.reference}</p><p className="mt-2 text-lg font-bold">{inr(application.result.recommended_loan || application.input.requested_loan)}</p></div><StatusChip status={application.status} /></div><p className="mt-4 text-sm text-slate-600">Requested {application.input.requested_tenure} months · {application.result.risk.risk_band} risk</p><p className="mt-2 text-xs text-slate-500">Submitted {new Date(application.created_at).toLocaleDateString("en-IN")}</p></button>)}</div>}</section></div></main>;
}

function StatusChip({ status }: { status: string }) {
  return <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700">{status.replaceAll("_", " ")}</span>;
}
