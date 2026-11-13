import type { ReportingGrouping } from "../reporting/reporting-grouping";

export type AccountReturnMetric = "twr" | "mwr";
export type AccountReturnBasis = "annualized" | "cumulative";
export type AccountReturnDiagnostic = {
  metric: AccountReturnMetric | "both";
  date?: string;
  message: string;
};
export type AccountReturnResult = {
  applicable: boolean;
  twr: number | null;
  mwr: number | null;
  annualizedTwr: number | null;
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
  startDate: string;
  date: string;
  openingValue: number | null;
  contributions: number;
  withdrawals: number;
  closingValue: number | null;
  factor: number | null;
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
    twr: null,
    mwr: null,
    annualizedTwr: null,
    annualizedMwr: null,
    effectiveStartDate: null,
    effectiveEndDate: null,
    diagnostics,
  };
}

export function accountReturnExplanation(
  result: AccountReturnResult | undefined,
  metric: AccountReturnMetric,
): string {
  if (!result) return "Returns are unavailable.";
  if (!result.applicable)
    return "Returns are shown for accounts reporting G/L.";
  return (
    result.diagnostics
      .filter((item) => item.metric === metric || item.metric === "both")
      .map((item) => item.message)
      .join(" ") ||
    (metric === "twr"
      ? "Time-weighted return: linked performance excluding capital movements."
      : "Money-weighted return: performance reflecting the timing and size of capital movements.")
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
