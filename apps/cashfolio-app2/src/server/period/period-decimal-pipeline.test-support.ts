import { vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import { moneyMultiply, toMoney } from "../../shared/money";
import type { PeriodBaseData } from "./base-data/period-base-data-types";

const prisma = vi.hoisted(() => ({
  account: { findFirst: vi.fn(), findMany: vi.fn() },
  booking: { groupBy: vi.fn() },
  transaction: { findMany: vi.fn() },
}));
const getOrLoadPeriodBaseData = vi.hoisted(() => vi.fn());
vi.mock("../../prisma.server", () => ({ prisma }));
vi.mock("./cache/period-base-data-cache", () => ({ getOrLoadPeriodBaseData }));
vi.mock("../valuation.server", () => ({
  getCurrencyExchangeRate: async ({ date }: { date: Date }) =>
    toMoney(date.getUTCMonth() === 0 ? "0.8" : "0.9"),
  getCurrencyExchangeRateDetails: async ({ date }: { date: Date }) => ({
    rate: toMoney(date.getUTCMonth() === 0 ? "0.8" : "0.9"),
    source: "timeSeries",
  }),
  getSecurityToCurrencyExchangeRate: async ({ date }: { date: Date }) =>
    securityRate(date),
  getSecurityToCurrencyExchangeRateDetails: async ({
    date,
  }: {
    date: Date;
  }) => ({ rate: securityRate(date), source: "timeSeries" }),
}));
export function securityRate(date: Date) {
  return toMoney(
    date.getUTCMonth() === 0
      ? "123.123456789123456789"
      : date.getUTCDate() === 28
        ? "150.123456789123456789"
        : "140.123456789123456789",
  );
}

export function createScenario(): PeriodBaseData {
  const holding = {
    id: "security",
    name: "Security",
    groupId: null,
    type: AccountType.BALANCE,
    unit: Unit.SECURITY,
    currency: null,
    cryptocurrency: null,
    symbol: "ABC",
    tradeCurrency: "CHF",
    assetClassId: null,
    isCashAccount: false,
  };
  const date = new Date("2026-02-15T00:00:00Z");
  return {
    accountBookId: "book-1",
    periodValue: "2026-02",
    referenceCurrency: "CHF",
    selection: {
      periodValue: "2026-02",
      label: "Feb 2026",
      periodSpecifier: "month",
      granularity: "month",
      year: 2026,
      month: 1,
      from: new Date("2026-02-01"),
      to: new Date("2026-02-28"),
      queryEndExclusive: new Date("2026-03-01"),
      initialHoldingDate: new Date("2026-01-31"),
      isBeforeAccountBookStart: false,
      minPeriodDate: new Date("2026-01-01"),
    },
    allAccountGroups: [],
    baseAssetLiabilityAccounts: [holding],
    holdingAccountsResolved: [holding],
    endOfPeriodRawBalances: [
      { accountId: holding.id, rawBalance: toMoney("0.2") },
    ],
    transferClearingUnitBuckets: [],
    explicitCounterparts: [],
    executionResidualTransactions: [],
    initialHoldingBalances: [
      { accountId: holding.id, rawBalance: toMoney("0.3") },
    ],
    holdingTransactions: [
      {
        id: "sell",
        bookings: [
          {
            id: "security-close",
            accountId: holding.id,
            date,
            value: toMoney("-0.1"),
            unit: Unit.SECURITY,
            currency: null,
            cryptocurrency: null,
            symbol: "ABC",
            tradeCurrency: "CHF",
            accountType: AccountType.BALANCE,
            equityAccountSubtype: null,
          },
          {
            id: "cash-close",
            accountId: "cash",
            date,
            value: moneyMultiply("0.1", securityRate(date)),
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            accountType: AccountType.BALANCE,
            equityAccountSubtype: null,
          },
        ],
      },
    ],
    equityBookings: ["-0.1", "-0.235"].map((value, index) => ({
      id: `income-${index}`,
      accountId: "income",
      accountName: "Income",
      accountGroupId: null,
      equityAccountSubtype: EquityAccountSubtype.INCOME,
      transactionId: `income-${index}`,
      date,
      value: toMoney(value),
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    })),
    cashFlowTransactions: [],
    hasCashAccounts: false,
  };
}

export {
  buildRealAccountReconciliation,
  computeEndOfPeriodBalanceStats,
  getOrLoadPeriodBaseData,
  loadAccountGainLossSources,
  loadPeriodHistoryPointMetrics,
  loadPeriodOverview,
  prisma,
};

// Register mocks before loading any tested module or its transitive dependencies.
const { loadPeriodHistoryPointMetrics } =
  await import("./history/period-history-point-metrics.server");
const { loadPeriodOverview } =
  await import("./overview/period-overview.server");
const { computeEndOfPeriodBalanceStats } =
  await import("./period-balance-stats");
const { loadAccountGainLossSources } =
  await import("./reconciliation/period-account-gain-loss-sources");
const { buildRealAccountReconciliation } =
  await import("./reconciliation/period-gain-loss-reconciliation-real-account");
