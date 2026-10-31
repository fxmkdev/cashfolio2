import type {
  HistoryScopeOption,
  HistoryScopeSelection,
} from "../../../shared/history-scope";
import type { HistoryOpeningBalancePoint } from "./period-history-opening-balance.server";

export type PeriodHistoryGranularity = "month" | "year";

export type PeriodHistoryPoint = {
  periodValue: string;
  periodLabel: string;
  periodEndDate: string;
  totalReturn: number;
  savings: number;
  cashFlow: number;
  income: number;
  expenses: number;
  gainsLosses: number;
  assets: number;
  liabilities: number;
  netWorth: number;
};

export type PeriodHistoryOpeningBalancePoint =
  import("../../money-boundary").NumericMoney<HistoryOpeningBalancePoint>;

export type PeriodHistoryResponse = {
  referenceCurrency: string;
  hasCashAccounts: boolean;
  openingBalancePoint: PeriodHistoryOpeningBalancePoint;
  points: PeriodHistoryPoint[];
  scopeOptions: {
    cashFlow: HistoryScopeOption[];
    income: HistoryScopeOption[];
    expenses: HistoryScopeOption[];
    gainsLosses: HistoryScopeOption[];
    netWorth: HistoryScopeOption[];
  };
  scopeSelection: {
    cashFlow: HistoryScopeSelection;
    income: HistoryScopeSelection;
    expenses: HistoryScopeSelection;
    gainsLosses: HistoryScopeSelection;
    netWorth: HistoryScopeSelection;
  };
};

export type PeriodHistoryBatchResponse = Omit<
  PeriodHistoryResponse,
  "openingBalancePoint"
> & {
  nextBefore?: string;
  revision: string;
  openingBalancePoint: PeriodHistoryOpeningBalancePoint | null;
};
