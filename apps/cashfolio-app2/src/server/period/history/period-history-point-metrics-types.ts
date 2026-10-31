import type { Money } from "../../../shared/money";
import type { HistoryScopeOption } from "../../../shared/history-scope";
import type { DecimalValuationRateLookupResult as ValuationRateLookupResult } from "../../valuation/types";
import type { PeriodBaseData } from "../cache/period-base-data-cache";
import type { HistoryMetricScopeFilter } from "./period-history-scopes.server";

export type PeriodHistoryPointMetrics = {
  totalReturn: Money;
  savings: Money;
  cashFlow: Money;
  income: Money;
  expenses: Money;
  gainsLosses: Money;
  assets: Money;
  liabilities: Money;
  netWorth: Money;
  scopeOptions: {
    cashFlow: HistoryScopeOption[];
    income: HistoryScopeOption[];
    expenses: HistoryScopeOption[];
    gainsLosses: HistoryScopeOption[];
    netWorth: HistoryScopeOption[];
  };
  scopedMetricValue?: Money;
};

export type HistoryValuationContext = {
  exchangeRateByKey: Map<string, Promise<ValuationRateLookupResult>>;
};

export type PeriodHistoryPointMetricsResult = {
  metrics: PeriodHistoryPointMetrics;
  cacheableFromPermanentValuationCache: boolean;
};

export type HistoryPointMetricsInput = {
  accountBookId: string;
  period?: unknown;
  baseData?: PeriodBaseData;
  metricScopeFilter?: HistoryMetricScopeFilter;
  valuationContext?: HistoryValuationContext;
};
