import { CheckCircle2, Handshake, XCircle } from "lucide-react";
import type { LoanEvaluationResponse } from "@/lib/loan/types";
import { inr } from "./format";

const MAP = {
  APPROVED_AS_REQUESTED: {
    icon: CheckCircle2,
    title: "Approved as Requested",
    tone: "border-emerald-200 bg-emerald-50/80 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
    iconTone: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700",
    action: "Proceed to documentation and final sanction verification.",
  },
  COUNTER_OFFER: {
    icon: Handshake,
    title: "Counter-Offer Available",
    tone: "border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
    iconTone: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700",
    action: "Review the adjusted loan amount and accept or revise the tenure.",
  },
  REJECTED: {
    icon: XCircle,
    title: "Application Declined",
    tone: "border-rose-200 bg-rose-50/80 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200",
    iconTone: "text-rose-600 dark:text-rose-400",
    badge: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/50 dark:text-rose-300 dark:border-rose-700",
    action: "Reduce requested principal or clear existing EMIs before reapplying.",
  },
} as const;

export function DecisionBanner({ result }: { result: LoanEvaluationResponse }) {
  const cfg = MAP[result.decision_type];
  const Icon = cfg.icon;

  return (
    <div className={`animate-rise rounded-xl border p-5 sm:p-6 shadow-sm ${cfg.tone}`} role="status">
      <div className="flex items-start gap-4">
        <Icon className={`mt-0.5 size-7 shrink-0 ${cfg.iconTone}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl sm:text-2xl font-bold leading-tight">{cfg.title}</h2>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${cfg.badge}`}>
              {result.decision_type.replaceAll("_", " ")}
            </span>
          </div>
          <p className="mt-1.5 text-sm sm:text-base font-medium opacity-90">{result.eligibility_message}</p>
          {result.decision_type === "COUNTER_OFFER" && (
            <div className="mt-2.5 inline-block rounded-md border border-amber-300/80 bg-amber-100/60 px-3 py-1.5 font-mono text-sm font-bold text-amber-900 dark:border-amber-700/80 dark:bg-amber-900/40 dark:text-amber-200">
              Requested {inr(result.requested.loan_amount)} → Recommended {inr(result.recommended_loan)}
            </div>
          )}
          <p className="mt-2.5 text-xs sm:text-sm font-semibold opacity-80">
            <span className="font-bold">Next Step:</span> {cfg.action}
          </p>
        </div>
      </div>
    </div>
  );
}
