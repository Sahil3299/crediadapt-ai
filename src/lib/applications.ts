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
  applicant_name?: string | null;
  applicant_email?: string | null;
  input: LoanRequestInput;
  result: LoanEvaluationResponse;
  status: ApplicationStatus;
  status_history?: Array<{
    from: ApplicationStatus | null;
    to: ApplicationStatus;
    by: string;
    role: "applicant" | "officer";
    reason: string;
    at: string;
  }>;
  assigned_officer_id?: string | null;
  counter_offer?: {
    amount: number;
    tenure_months: number;
    interest_rate: number;
  };
  applicant_response?: string;
  created_at: string;
  updated_at: string;
}

export interface ApplicationNotification {
  id: string;
  application_id: string;
  message: string;
  read: boolean;
  created_at: string;
}
