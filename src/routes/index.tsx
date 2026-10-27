import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({ component: LandingPage });

function LandingPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-12 text-slate-900">
      <section className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-xl shadow-slate-200/50 sm:p-12">
        <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
          <ShieldCheck className="size-4" aria-hidden /> CrediAdapt AI
        </div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">A clearer path to your loan.</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
          Create a secure application, receive a personalised affordability assessment, and track every review step in one place.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white transition hover:bg-sky-700"
          >
            Check my eligibility <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link
            to="/officer/login"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Officer sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
