import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import { inr } from "@/components/loan/format";
import { apiRequest, RequireAuth, signOut, type AuthUser } from "@/lib/auth";
import type { StoredApplication } from "@/lib/applications";

export const Route = createFileRoute("/officer/queue")({ component: OfficerQueue });

function OfficerQueue() {
  return <RequireAuth role="officer">{(user) => <QueueWorkspace user={user} />}</RequireAuth>;
}

function QueueWorkspace({ user }: { user: AuthUser }) {
  const [applications, setApplications] = useState<StoredApplication[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  async function loadQueue() {
    setLoading(true);
    try {
      const response = await apiRequest<{ items: StoredApplication[] }>("/api/officer/queue");
      setApplications(response.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load applications.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void loadQueue(); }, []);
  return <main className="min-h-screen bg-slate-950 text-slate-100"><header className="border-b border-slate-800 bg-slate-900"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4"><div><Link to="/" className="font-bold text-sky-400">CrediAdapt AI</Link><p className="text-sm text-slate-400">Officer workspace</p></div><div className="flex items-center gap-3"><div className="text-right"><p className="text-sm font-semibold">{user.full_name}</p><p className="text-xs text-slate-400">Loan officer</p></div><button onClick={() => void signOut().then(() => window.location.replace("/"))} aria-label="Sign out" className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"><LogOut className="size-4" /></button></div></div></header><section className="mx-auto max-w-7xl px-5 py-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-bold tracking-tight">Application queue</h1><p className="mt-1 text-slate-400">All submitted applications are visible to loan officers.</p></div><button onClick={() => void loadQueue()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-800"><RefreshCw className="size-4" /> Refresh</button></div>{error && <p role="alert" className="mt-5 rounded-xl bg-rose-950/60 p-4 text-sm text-rose-200">{error}</p>}<div className="mt-7 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">{loading ? <p className="p-6 text-sm text-slate-400">Loading queue…</p> : applications.length === 0 ? <p className="p-6 text-sm text-slate-400">No applications have been submitted.</p> : <table className="w-full text-left text-sm"><thead className="bg-slate-800/80 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Reference</th><th className="px-5 py-3">Request</th><th className="px-5 py-3">AI result</th><th className="px-5 py-3">Risk</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{applications.map((application) => <tr key={application.id} className="border-t border-slate-800"><td className="px-5 py-4 font-mono text-xs">{application.reference}</td><td className="px-5 py-4">{inr(application.input.requested_loan)}</td><td className="px-5 py-4">{inr(application.result.recommended_loan)}</td><td className="px-5 py-4">{application.result.risk.risk_band}</td><td className="px-5 py-4"><span className="rounded-full bg-sky-950 px-2.5 py-1 text-xs font-semibold text-sky-300">{application.status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table>}</div><p className="mt-4 text-sm text-slate-400">Review actions and queue filters arrive in Phase 2.</p></section></main>;
}
