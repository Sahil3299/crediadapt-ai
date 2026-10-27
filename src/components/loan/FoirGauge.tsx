import { CheckCircle2, TriangleAlert } from "lucide-react";
import { pct } from "./format";

export function FoirGauge({
  requestedFoir,
  finalFoir,
  maxFoir,
}: {
  requestedFoir: number;
  finalFoir: number;
  maxFoir: number;
}) {
  const scaleMax = Math.max(1, requestedFoir, finalFoir) * 1.05;
  const within = finalFoir <= maxFoir;
  const width = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">FOIR Affordability Meter</p>
        <p className="font-mono text-base font-bold">
          <span className={within ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>{pct(finalFoir)}</span>
          <span className="text-slate-400 dark:text-slate-500"> / {pct(maxFoir, 0)} Regulatory Cap</span>
        </p>
      </div>

      <div className="relative mt-4 h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${within ? "bg-sky-600 dark:bg-sky-500" : "bg-rose-500"}`}
          style={{ width: width(finalFoir) }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-slate-900 dark:bg-slate-300"
          style={{ left: width(maxFoir) }}
          aria-hidden
        />
      </div>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
        <span>Initial FOIR: <strong className="font-mono text-slate-900 dark:text-white">{pct(requestedFoir)}</strong></span>
        <span className="flex items-center gap-1.5">
          {within ? (
            <>
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <span className="text-emerald-700 dark:text-emerald-300 font-bold">Complies with 60% ceiling</span>
            </>
          ) : (
            <>
              <TriangleAlert className="size-4 text-rose-600 dark:text-rose-400" aria-hidden />
              <span className="text-rose-700 dark:text-rose-300 font-bold">Breaches 60% regulatory ceiling</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
