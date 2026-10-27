import { Link, createFileRoute } from "@tanstack/react-router";
import { FormEvent, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { signIn } from "@/lib/auth";

export const Route = createFileRoute("/officer/login")({ component: OfficerLogin });

function OfficerLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password, "officer");
      window.location.replace("/officer/queue");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }
  return <main className="grid min-h-screen place-items-center bg-slate-950 px-5 py-10"><form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl sm:p-9"><div className="flex items-center gap-2 text-sky-700"><ShieldCheck className="size-5" aria-hidden /><span className="font-bold">CrediAdapt AI</span></div><h1 className="mt-5 text-2xl font-bold tracking-tight">Officer sign in</h1><p className="mt-1 text-sm text-slate-600">Access is provisioned by your administrator.</p><label className="mt-6 block text-sm font-medium text-slate-700">Work email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100" /></label><label className="mt-4 block text-sm font-medium text-slate-700">Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100" /></label>{error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<button disabled={submitting} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{submitting ? "Please wait…" : "Sign in"} <ArrowRight className="size-4" aria-hidden /></button><p className="mt-5 border-t pt-5 text-center text-sm text-slate-600">Applying for a loan? <Link to="/login" className="font-semibold text-sky-700 hover:underline">Applicant sign in</Link></p></form></main>;
}
