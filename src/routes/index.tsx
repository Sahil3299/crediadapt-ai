import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  Clock3,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: LandingPage });

function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f7fafb] text-slate-950">
      <header className="border-b border-slate-200/80 bg-white/90">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"
        >
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight text-sky-900">
            <span className="grid size-9 place-items-center rounded-xl bg-sky-700 text-white">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            CrediAdapt AI
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/officer/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:block"
            >
              Officer sign in
            </Link>
            <Link
              to="/login"
              className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800"
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-8 sm:py-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-sky-800">
            <span className="size-2 rounded-full bg-emerald-500" /> Loan application workspace
          </p>
          <h1 className="mt-6 max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            A clearer path to your loan.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
            Understand affordability, review an indicative assessment, and follow your application
            from submission through officer review.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3.5 font-semibold text-white shadow-lg shadow-sky-900/10 transition hover:bg-sky-800"
            >
              Check my eligibility <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              to="/officer/login"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3.5 font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Officer sign in
            </Link>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Assessments are indicative and are not a loan approval or credit offer.
          </p>
        </div>
        <div
          aria-label="Illustrative affordability assessment preview"
          className="relative mx-auto w-full max-w-lg"
        >
          <div
            className="absolute -left-8 top-12 size-28 rounded-full bg-cyan-100 blur-2xl"
            aria-hidden
          />
          <div
            className="absolute -right-7 bottom-8 size-36 rounded-full bg-sky-100 blur-3xl"
            aria-hidden
          />
          <section className="relative rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-300/50 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-500">Assessment preview</p>
                <p className="mt-1 text-xl font-bold">Understand the numbers</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                Illustrative
              </span>
            </div>
            <div className="mt-7 grid grid-cols-2 gap-3">
              <PreviewMetric label="Monthly EMI" value="Based on your request" />
              <PreviewMetric label="Affordability" value="FOIR estimate" />
            </div>
            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold">Monthly obligations</span>
                <BarChart3 className="size-4 text-sky-700" aria-hidden />
              </div>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-200">
                <span className="w-2/5 bg-sky-600" />
                <span className="w-1/5 bg-cyan-300" />
                <span className="flex-1 bg-slate-200" />
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <span>Existing</span>
                <span>Proposed</span>
                <span>Remaining</span>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <PreviewStep
                icon={ClipboardCheck}
                title="Submit your application"
                detail="Start with the details needed for an assessment."
              />
              <PreviewStep
                icon={Clock3}
                title="Track review status"
                detail="See status updates and respond to information requests."
              />
            </div>
          </section>
        </div>
      </section>
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 md:grid-cols-3">
          <Feature
            title="A useful estimate"
            detail="Explore affordability, repayment, and early-closure estimates before an officer decision."
          />
          <Feature
            title="One place to follow up"
            detail="Review your submitted applications, status history, and requested next steps."
          />
          <Feature
            title="Human review"
            detail="AI output supports the workflow; an authorized loan officer records application decisions."
          />
        </div>
      </section>
      <footer className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-8 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>CrediAdapt AI · Indicative assessment workspace</p>
        <p>Final lending decisions are subject to officer review and lender policies.</p>
      </footer>
    </main>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function PreviewStep({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-100 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-700">
        <Icon className="size-4" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function Feature({ title, detail }: { title: string; detail: string }) {
  return (
    <article>
      <h2 className="font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
    </article>
  );
}
