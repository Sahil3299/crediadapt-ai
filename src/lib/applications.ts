import type { LoanEvaluationResponse, LoanRequestInput } from "@/lib/loan/types";

export type ApplicationStatus =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "INFO_REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "COUNTER_OFFERED"
  | "ACCEPTED"
  | "WITHDRAWN";

export interface StoredApplication {
  id: string;
  reference: string;
  applicant_id: string;
  input: LoanRequestInput;
  result: LoanEvaluationResponse;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
}
