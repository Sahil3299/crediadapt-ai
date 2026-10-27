import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getBackendHealth, runLoanPipeline } from "./pipeline.server";

export const loanRequestSchema = z.object({
  monthly_income: z.number().positive("Monthly income must be greater than zero."),
  age: z.number().int().min(18).max(75),
  gender: z.enum(["Female", "Male", "Other"]),
  house_rent: z.number().min(0),
  existing_emi: z.number().min(0),
  cibil_score: z.number().int().min(300).max(900),
  requested_loan: z.number().positive("Requested loan must be greater than zero."),
  requested_tenure: z.number().int().min(6).max(84),
  early_closure_month: z.number().int().min(1).max(84),
});

export const evaluateLoan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => loanRequestSchema.parse(data))
  .handler(async ({ data }) => runLoanPipeline(data));

export const checkBackendHealth = createServerFn({ method: "GET" })
  .handler(async () => getBackendHealth());
