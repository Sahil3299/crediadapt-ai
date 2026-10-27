import { Link, createFileRoute } from "@tanstack/react-router";
import { FormEvent, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { registerApplicant, signIn } from "@/lib/auth";

export const Route = createFileRoute("/login")({ component: ApplicantLogin });

function ApplicantLogin() {
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "register") await registerApplicant(email, password, fullName);
      else await signIn(email, password, "applicant");
      window.location.replace("/applications");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-7 shadow-lg shadow-slate-200/60 sm:p-9">
        <div className="flex items-center gap-2 text-sky-700"><ShieldCheck className="size-5" aria-hidden /><span className="font-bold">CrediAdapt AI</span></div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">{mode === "register" ? "Create your account" : "Welcome back"}</h1>
        <p className="mt-1 text-sm text-slate-600">Applicant portal</p>
        <div className="mt-6 space-y-4">
          {mode === "register" && <Field label="Full name" value={fullName} onChange={setFullName} autoComplete="name" />}
          <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="email" />
          <Field label="Password" value={password} onChange={setPassword} type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} {...(mode === "register" ? { hint: "At least 8 characters" } : {})} />
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <button disabled={submitting} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
          {submitting ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"} <ArrowRight className="size-4" aria-hidden />
        </button>
        <button type="button" onClick={() => { setMode(mode === "register" ? "sign-in" : "register"); setError(null); }} className="mt-4 w-full text-sm font-medium text-sky-700 hover:underline">
          {mode === "register" ? "Already have an account? Sign in" : "New to CrediAdapt? Create an account"}
        </button>
        <p className="mt-5 border-t pt-5 text-center text-sm text-slate-600">Loan officer? <Link to="/officer/login" className="font-semibold text-sky-700 hover:underline">Use officer sign in</Link></p>
      </form>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", autoComplete, hint }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string; hint?: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input required type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100" />{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label>;
}
