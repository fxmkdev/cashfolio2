import type { ReportingGrouping } from "../reporting/reporting-grouping";

export type AccountReturnBasis = "annualized" | "cumulative";
export type AccountReturnDiagnostic = {
  date?: string;
  message: string;
};
export type AccountReturnResult = {
  applicable: boolean;
  mwr: number | null;
  annualizedMwr: number | null;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
  diagnostics: AccountReturnDiagnostic[];
};
export type AccountReturnTarget =
  | { kind: "account"; id: string }
  | { kind: "group"; id: string }
  | { kind: "total" };
export type AccountReturnScope = {
  accountBookId: string;
  accountState: "active" | "inactive" | "all";
  grouping: ReportingGrouping;
};
export type AccountReturnSummaries = {
  referenceCurrency: string;
  startDate: string;
  asOfDate: string;
  rows: (AccountReturnResult & { id: string })[];
  total: AccountReturnResult;
};
export type AccountReturnValuation = {
  id: string;
  date: string;
  kind: "opening" | "intermediate" | "closing";
  value: number | null;
};
export type AccountReturnCashFlow = {
  id: string;
  date: string;
  amount: number;
  transactionId: string | null;
  description: string;
};
export type AccountReturnDetails = AccountReturnResult & {
  name: string;
  referenceCurrency: string;
  startDate: string;
  asOfDate: string;
  valuations: AccountReturnValuation[];
  cashFlows: AccountReturnCashFlow[];
};

export function emptyAccountReturnResult(
  applicable = true,
  diagnostics: AccountReturnDiagnostic[] = [],
): AccountReturnResult {
  return {
    applicable,
    mwr: null,
    annualizedMwr: null,
    effectiveStartDate: null,
    effectiveEndDate: null,
    diagnostics,
  };
}

export function accountReturnExplanation(
  result: AccountReturnResult | undefined,
): string {
  if (!result) return "Return is unavailable.";
  if (!result.applicable) return "Return is shown for accounts reporting G/L.";
  return (
    result.diagnostics.map((item) => item.message).join(" ") ||
    "Money-weighted return reflects how your money performed, accounting for the amounts and dates invested or withdrawn."
  );
}

export type AccountReturnProgress = {
  context: string;
  workId: string;
  revision: string;
  sequence: number;
  phase: "history" | "calculation" | "complete";
  completed: number;
  total: number;
  referenceCurrency: string;
  startDate: string;
  asOfDate: string;
  publication: string;
  rows: AccountReturnSummaries["rows"];
  totalResult?: AccountReturnResult;
};
export type AccountReturnWorkResponse<T> =
  | {
      status: "pending";
      continuation: string;
      progress?: AccountReturnProgress;
      retryAfterMs?: number;
    }
  | { status: "restart" }
  | { status: "complete"; data: T; progress?: AccountReturnProgress };
