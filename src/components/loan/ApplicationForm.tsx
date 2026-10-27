import { useState } from "react";
import {
  BadgeIndianRupee,
  CalendarClock,
  Gauge,
  Loader2,
  RotateCcw,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Gender, LoanRequestInput } from "@/lib/loan/types";
import { inr } from "./format";

export const DEFAULT_FORM: LoanRequestInput = {
  monthly_income: 95000,
  age: 27,
  gender: "Female",
  house_rent: 18000,
  existing_emi: 8000,
  cibil_score: 795,
  requested_loan: 500000,
  requested_tenure: 36,
  early_closure_month: 18,
};

type Errors = Partial<Record<keyof LoanRequestInput, string>>;

export function validate(v: LoanRequestInput): Errors {
  const e: Errors = {};
  if (!(v.monthly_income > 0)) e.monthly_income = "Monthly income must be greater than 0.";
  else if (v.monthly_income < 5000) e.monthly_income = "Income looks too low to assess.";
  if (v.age < 18 || v.age > 75) e.age = "Age must be between 18 and 75.";
  if (v.house_rent < 0) e.house_rent = "Rent cannot be negative.";
  if (v.existing_emi < 0) e.existing_emi = "Existing EMI cannot be negative.";
  if (v.cibil_score < 300 || v.cibil_score > 900)
    e.cibil_score = "CIBIL score must be between 300 and 900.";
  if (!(v.requested_loan > 0)) e.requested_loan = "Enter a loan amount greater than 0.";
  if (v.requested_tenure < 6 || v.requested_tenure > 84)
    e.requested_tenure = "Tenure must be between 6 and 84 months.";
  if (v.early_closure_month < 1 || v.early_closure_month > v.requested_tenure)
    e.early_closure_month = "Closure month must be within the tenure.";
  return e;
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: React.ElementType;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-slate-100 dark:border-slate-800 pt-5 first:border-t-0 first:pt-0">
      <div className="mb-3.5 flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <Icon className="size-4" aria-hidden />
        </span>
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">{title}</h3>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function MoneyField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  error?: string | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-semibold text-slate-700 dark:text-slate-300">
        {label}
      </Label>
      <div className="relative">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 dark:text-slate-500"
          aria-hidden
        >
          ₹
        </span>
        <Input
          id={id}
          inputMode="numeric"
          className="h-10 pl-7 font-mono text-base font-bold text-slate-900 border-slate-200 bg-white focus-visible:ring-1 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-800/90 dark:text-white"
          value={Number.isFinite(value) ? value : ""}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          onChange={(e) => onChange(Number(e.target.value.replace(/[^\d.]/g, "")) || 0)}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {inr(value)}
        </p>
      )}
    </div>
  );
}

function SliderField({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  error?: string | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id} className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {label}
        </Label>
        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-800 border border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700">
          {value}
          {suffix ? ` ${suffix}` : ""}
        </span>
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(vals) => onChange(vals[0] ?? value)}
        aria-label={label}
      />
      {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}

export function ApplicationForm({
  value,
  onChange,
  onSubmit,
  onReset,
  loading,
}: {
  value: LoanRequestInput;
  onChange: (v: LoanRequestInput) => void;
  onSubmit: () => void;
  onReset: () => void;
  loading: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const errors = validate(value);
  const shown: Errors = touched ? errors : {};
  const set = <K extends keyof LoanRequestInput>(key: K, v: LoanRequestInput[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (Object.keys(errors).length === 0) onSubmit();
      }}
      className="rounded-xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-[#0f172a]"
    >
      <div className="mb-5 border-b border-slate-100 dark:border-slate-800 pb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">Intake Configuration</p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Applicant Financial Profile</h2>
      </div>

      <div className="space-y-6">
        <Section icon={UserRound} title="Applicant profile" hint="Who is applying">
          <MoneyField
            id="monthly_income"
            label="Monthly income"
            value={value.monthly_income}
            error={shown.monthly_income}
            onChange={(v) => set("monthly_income", v)}
          />
          <div className="space-y-1.5">
            <Label htmlFor="gender" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Gender
            </Label>
            <Select
              value={value.gender}
              onValueChange={(v) => set("gender", v as Gender)}
            >
              <SelectTrigger id="gender" className="h-10 text-base font-semibold text-slate-900 border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/90 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-900 dark:border-slate-700">
                <SelectItem value="Female" className="text-sm font-medium">Female</SelectItem>
                <SelectItem value="Male" className="text-sm font-medium">Male</SelectItem>
                <SelectItem value="Other" className="text-sm font-medium">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <SliderField
              id="age"
              label="Age"
              value={value.age}
              min={18}
              max={75}
              suffix="years"
              error={shown.age}
              onChange={(v) => set("age", v)}
            />
          </div>
        </Section>

        <Section
          icon={Wallet}
          title="Financial obligations"
          hint="Monthly commitments used for FOIR"
        >
          <MoneyField
            id="house_rent"
            label="Monthly Expense"
            value={value.house_rent}
            error={shown.house_rent}
            onChange={(v) => set("house_rent", v)}
          />
          <MoneyField
            id="existing_emi"
            label="Existing EMI"
            value={value.existing_emi}
            error={shown.existing_emi}
            onChange={(v) => set("existing_emi", v)}
          />
        </Section>

        <Section icon={Gauge} title="Credit profile" hint="Bureau score drives pricing">
          <div className="sm:col-span-2">
            <SliderField
              id="cibil_score"
              label="CIBIL score"
              value={value.cibil_score}
              min={300}
              max={900}
              step={5}
              error={shown.cibil_score}
              onChange={(v) => set("cibil_score", v)}
            />
          </div>
        </Section>

        <Section icon={BadgeIndianRupee} title="Loan request" hint="What is being asked for">
          <MoneyField
            id="requested_loan"
            label="Requested loan amount"
            value={value.requested_loan}
            error={shown.requested_loan}
            onChange={(v) => set("requested_loan", v)}
          />
          <div className="space-y-1.5">
            <Label htmlFor="requested_tenure" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Tenure (months)
            </Label>
            <Input
              id="requested_tenure"
              inputMode="numeric"
              className="h-10 font-mono text-base font-bold text-slate-900 border-slate-200 bg-white focus-visible:ring-1 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-800/90 dark:text-white"
              value={value.requested_tenure}
              aria-invalid={!!shown.requested_tenure}
              onChange={(e) =>
                set("requested_tenure", Number(e.target.value.replace(/\D/g, "")) || 0)
              }
            />
            {shown.requested_tenure ? (
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{shown.requested_tenure}</p>
            ) : (
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">6 – 84 months</p>
            )}
          </div>
        </Section>

        <Section
          icon={CalendarClock}
          title="Early closure simulation"
          hint="Model a foreclosure month"
        >
          <div className="sm:col-span-2">
            <SliderField
              id="early_closure_month"
              label="Early closure month"
              value={value.early_closure_month}
              min={1}
              max={Math.max(6, value.requested_tenure || 84)}
              error={shown.early_closure_month}
              onChange={(v) => set("early_closure_month", v)}
            />
          </div>
        </Section>
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <Button
          type="submit"
          size="lg"
          disabled={loading}
          className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-sm h-11 dark:bg-sky-600 dark:hover:bg-sky-500"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Evaluating…
            </>
          ) : (
            <>
              <ShieldCheck className="size-4" aria-hidden /> Evaluate Loan
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            setTouched(false);
            onReset();
          }}
          disabled={loading}
          className="border-slate-200 hover:bg-slate-50 font-semibold text-slate-700 h-11 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <RotateCcw className="size-4" aria-hidden /> Reset
        </Button>
      </div>
    </form>
  );
}
