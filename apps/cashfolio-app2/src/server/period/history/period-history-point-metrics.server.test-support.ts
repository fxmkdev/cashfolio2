import { vi } from "vitest";

import type { PeriodBaseData } from "../cache/period-base-data-cache.server";

const getOrLoadPeriodBaseData = vi.hoisted(() => vi.fn());

const processPeriodEquityBookingsFromBaseData = vi.hoisted(() => vi.fn());

const computePeriodHoldingGainLoss = vi.hoisted(() => vi.fn());

const convertBookingValueToReferenceDetails = vi.hoisted(() => vi.fn());

const getUnitToReferenceExchangeRateDetails = vi.hoisted(() => vi.fn());

vi.mock("../cache/period-base-data-cache.server", () => ({
  getOrLoadPeriodBaseData,
}));

vi.mock("../overview/period-equity-bookings", () => ({
  processPeriodEquityBookingsFromBaseData,
}));

vi.mock("../holdings/period-holding-gain-loss.server", () => ({
  computePeriodHoldingGainLoss,
}));

vi.mock("../period-conversion.server", () => ({
  convertBookingValueToReferenceDetails,
  getUnitToReferenceExchangeRateDetails,
}));

function createBaseData(args?: {
  isBefore?: boolean;
  selection?: Partial<PeriodBaseData["selection"]>;
  overrides?: Partial<PeriodBaseData>;
}): PeriodBaseData {
  const baseData: PeriodBaseData = {
    accountBookId: "book-1",
    periodValue: "2026-02",
    referenceCurrency: "CHF",
    selection: {
      periodValue: "2026-02",
      label: "February 2026",
      periodSpecifier: "month",
      granularity: "month",
      year: 2026,
      month: 2,
      from: new Date("2026-02-01T00:00:00.000Z"),
      to: new Date("2026-02-28T00:00:00.000Z"),
      queryEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      initialHoldingDate: new Date("2026-01-31T00:00:00.000Z"),
      isBeforeAccountBookStart: args?.isBefore ?? false,
      minPeriodDate: new Date("2026-01-01T00:00:00.000Z"),
      ...(args?.selection ?? {}),
    },
    allAccountGroups: [],
    baseAssetLiabilityAccounts: [],
    holdingAccountsResolved: [],
    endOfPeriodRawBalances: [],
    transferClearingUnitBuckets: [],
    equityBookings: [],
    explicitCounterparts: [],
    executionResidualTransactions: [],
    initialHoldingBalances: [],
    holdingTransactions: [],
    cashFlowTransactions: [],
    hasCashAccounts: true,
  };

  return {
    ...baseData,
    ...(args?.overrides ?? {}),
    selection: {
      ...baseData.selection,
      ...(args?.overrides?.selection ?? {}),
    },
  };
}
const resetHistoryMetrics = () => {
  vi.clearAllMocks();
};
export {
  computePeriodHoldingGainLoss,
  convertBookingValueToReferenceDetails,
  createBaseData,
  getOrLoadPeriodBaseData,
  getUnitToReferenceExchangeRateDetails,
  loadPeriodHistoryPointMetrics,
  loadPeriodHistoryPointMetricsWithCacheability,
  processPeriodEquityBookingsFromBaseData,
  resetHistoryMetrics,
};

// Register mocks before importing the tested modules and their dependencies.
const {
  loadPeriodHistoryPointMetrics,
  loadPeriodHistoryPointMetricsWithCacheability,
} = await import("./period-history-point-metrics.server");
