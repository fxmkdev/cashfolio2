import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import type { PeriodBaseData } from "./period-base-data-cache";

const getOrLoadPeriodBaseData = vi.hoisted(() => vi.fn());
const processPeriodEquityBookingsFromBaseData = vi.hoisted(() => vi.fn());
const computePeriodHoldingGainLoss = vi.hoisted(() => vi.fn());
const convertBookingValueToReferenceDetails = vi.hoisted(() => vi.fn());
const getUnitToReferenceExchangeRateDetails = vi.hoisted(() => vi.fn());

vi.mock("./period-base-data-cache", () => ({
  getOrLoadPeriodBaseData,
}));

vi.mock("./period-equity-bookings", () => ({
  processPeriodEquityBookingsFromBaseData,
}));

vi.mock("./period-holding-gain-loss", () => ({
  computePeriodHoldingGainLoss,
}));

vi.mock("./period-conversion", () => ({
  convertBookingValueToReferenceDetails,
  getUnitToReferenceExchangeRateDetails,
}));

import {
  loadPeriodTimelinePointMetrics,
  loadPeriodTimelinePointMetricsWithCacheability,
} from "./period-timeline-point-metrics.server";

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
    initialHoldingBalances: [],
    holdingTransactions: [],
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

describe("loadPeriodTimelinePointMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns zeros before account-book start without running metric pipelines", async () => {
    const baseData = createBaseData({ isBefore: true });

    getOrLoadPeriodBaseData.mockResolvedValue(baseData);

    const result = await loadPeriodTimelinePointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(result).toEqual({
      totalReturn: 0,
      savings: 0,
      income: 0,
      expenses: 0,
      gainsLosses: 0,
      assets: 0,
      liabilities: 0,
      netWorth: 0,
      scopeOptions: {
        income: [],
        expenses: [],
        assets: [],
        liabilities: [],
      },
      scopedMetricValue: undefined,
    });
    expect(processPeriodEquityBookingsFromBaseData).not.toHaveBeenCalled();
    expect(computePeriodHoldingGainLoss).not.toHaveBeenCalled();
  });

  test("returns scoped metric value zero before account-book start when scope filter is requested", async () => {
    const baseData = createBaseData({ isBefore: true });

    getOrLoadPeriodBaseData.mockResolvedValue(baseData);

    const result = await loadPeriodTimelinePointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
      metricScopeFilter: {
        metric: "expenses",
        scope: "total",
      },
    });

    expect(result.scopedMetricValue).toBe(0);
  });

  test("loads scalar metrics from shared equity + holdings pipelines", async () => {
    const baseData = createBaseData();
    getOrLoadPeriodBaseData.mockResolvedValue(baseData);
    processPeriodEquityBookingsFromBaseData.mockImplementation(
      async ({
        equityAggregation,
      }: {
        equityAggregation: {
          income: number;
          expenses: number;
          explicitGainLoss: number;
        };
      }) => {
        equityAggregation.income = 120;
        equityAggregation.expenses = 20;
        equityAggregation.explicitGainLoss = 30;
        return {
          bookingsCount: 3,
          convertedCount: 3,
          skippedCount: 0,
        };
      },
    );
    computePeriodHoldingGainLoss.mockResolvedValue({
      realizedGainLoss: 7,
      unrealizedGainLoss: -2,
      convertedCount: 0,
      skippedCount: 0,
    });
    convertBookingValueToReferenceDetails.mockResolvedValue({
      value: 1,
      source: "identity",
    });
    getUnitToReferenceExchangeRateDetails.mockResolvedValue({
      rate: 1,
      source: "identity",
    });

    const result = await loadPeriodTimelinePointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(getOrLoadPeriodBaseData).toHaveBeenCalledWith({
      accountBookId: "book-1",
      period: "2026-02",
    });
    expect(processPeriodEquityBookingsFromBaseData).toHaveBeenCalledTimes(1);
    expect(computePeriodHoldingGainLoss).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      totalReturn: 135,
      savings: 100,
      income: 120,
      expenses: 20,
      gainsLosses: 35,
      assets: 0,
      liabilities: 0,
      netWorth: 0,
      scopeOptions: {
        income: [],
        expenses: [],
        assets: [],
        liabilities: [],
      },
      scopedMetricValue: undefined,
    });
  });

  test("marks metrics cacheable only when valuation sources are permanent", async () => {
    const baseData = createBaseData({
      overrides: {
        equityBookings: [
          {
            id: "booking-1",
            accountId: "income-1",
            accountName: "Income",
            accountGroupId: null,
            equityAccountSubtype: EquityAccountSubtype.INCOME,
            transactionId: "transaction-1",
            date: new Date("2026-02-10T00:00:00.000Z"),
            value: 100,
            unit: Unit.CURRENCY,
            currency: "USD",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
        ],
      },
    });
    getOrLoadPeriodBaseData.mockResolvedValue(baseData);
    processPeriodEquityBookingsFromBaseData.mockImplementation(
      async ({
        convertBookingToReference,
      }: {
        convertBookingToReference: (booking: {
          value: number;
          unit: Unit;
          currency: string | null;
          cryptocurrency: string | null;
          symbol: string | null;
          tradeCurrency: string | null;
          date: Date;
        }) => Promise<number | null>;
      }) => {
        await convertBookingToReference({
          value: 100,
          unit: Unit.CURRENCY,
          currency: "USD",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          date: new Date("2026-02-10T00:00:00.000Z"),
        });
      },
    );
    computePeriodHoldingGainLoss.mockResolvedValue({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      convertedCount: 0,
      skippedCount: 0,
    });
    convertBookingValueToReferenceDetails.mockResolvedValue({
      value: 100,
      source: "provider",
    });

    const result = await loadPeriodTimelinePointMetricsWithCacheability({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(result.cacheableFromPermanentValuationCache).toBe(false);
  });

  test("computes assets, liabilities, and net worth from end-of-period balances", async () => {
    const baseData = createBaseData({
      overrides: {
        baseAssetLiabilityAccounts: [
          {
            id: "asset-1",
            name: "Cash",
            groupId: null,
            type: AccountType.ASSET,
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
          {
            id: "liability-1",
            name: "Credit Card",
            groupId: null,
            type: AccountType.LIABILITY,
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
        ],
        endOfPeriodRawBalances: [
          { accountId: "asset-1", rawBalance: 200 },
          { accountId: "liability-1", rawBalance: -70 },
        ],
        transferClearingUnitBuckets: [
          {
            unitKey: "currency:USD",
            unitLabel: "USD",
            unitType: "currency",
            unit: Unit.CURRENCY,
            currency: "USD",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            isNonReferenceUnit: true,
            rawBalance: -50,
            bookings: [],
          },
        ],
      },
    });

    getOrLoadPeriodBaseData.mockResolvedValue(baseData);
    processPeriodEquityBookingsFromBaseData.mockImplementation(
      async ({
        equityAggregation,
      }: {
        equityAggregation: {
          income: number;
          expenses: number;
          explicitGainLoss: number;
        };
      }) => {
        equityAggregation.income = 0;
        equityAggregation.expenses = 0;
        equityAggregation.explicitGainLoss = 0;
      },
    );
    computePeriodHoldingGainLoss.mockResolvedValue({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      convertedCount: 0,
      skippedCount: 0,
    });
    convertBookingValueToReferenceDetails.mockImplementation(
      async ({ value }: { value: number }) => ({
        value,
        source: "identity",
      }),
    );
    getUnitToReferenceExchangeRateDetails.mockResolvedValue({
      rate: 1,
      source: "identity",
    });

    const result = await loadPeriodTimelinePointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(result).toEqual({
      totalReturn: 0,
      savings: 0,
      income: 0,
      expenses: 0,
      gainsLosses: 0,
      assets: 250,
      liabilities: 70,
      netWorth: 180,
      scopeOptions: {
        income: [],
        expenses: [],
        assets: [
          {
            value: "account:asset-1",
            label: "Cash",
            kind: "account",
            treeLabel: "Cash",
          },
          {
            value: "group:virtual:transfer-clearing",
            label: "Transfer Clearing",
            kind: "group",
            treeLabel: "Transfer Clearing",
          },
          {
            value: "group:virtual:transfer-clearing:currency",
            label: "Transfer Clearing / Currency",
            kind: "group",
            treeLabel: "Currency",
            parentValue: "group:virtual:transfer-clearing",
          },
          {
            value: "account:virtual:transfer-clearing:account:currency:USD",
            label: "Transfer Clearing / Currency / USD",
            kind: "account",
            treeLabel: "USD",
            parentValue: "group:virtual:transfer-clearing:currency",
          },
        ],
        liabilities: [
          {
            value: "account:liability-1",
            label: "Credit Card",
            kind: "account",
            treeLabel: "Credit Card",
          },
        ],
      },
      scopedMetricValue: undefined,
    });
  });

  test("builds balance scope options and resolves scoped liability values", async () => {
    const baseData = createBaseData({
      overrides: {
        allAccountGroups: [
          { id: "grp-assets", name: "Assets", parentGroupId: null },
          { id: "grp-liabilities", name: "Liabilities", parentGroupId: null },
        ],
        baseAssetLiabilityAccounts: [
          {
            id: "asset-1",
            name: "Cash",
            groupId: "grp-assets",
            type: AccountType.ASSET,
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
          {
            id: "liability-1",
            name: "Credit Card",
            groupId: "grp-liabilities",
            type: AccountType.LIABILITY,
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
          },
        ],
        endOfPeriodRawBalances: [
          { accountId: "asset-1", rawBalance: 200 },
          { accountId: "liability-1", rawBalance: -70 },
        ],
        transferClearingUnitBuckets: [
          {
            unitKey: "currency:USD",
            unitLabel: "USD",
            unitType: "currency",
            unit: Unit.CURRENCY,
            currency: "USD",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            isNonReferenceUnit: true,
            rawBalance: 50,
            bookings: [],
          },
        ],
      },
    });

    getOrLoadPeriodBaseData.mockResolvedValue(baseData);
    processPeriodEquityBookingsFromBaseData.mockImplementation(
      async ({
        equityAggregation,
      }: {
        equityAggregation: {
          income: number;
          expenses: number;
          explicitGainLoss: number;
        };
      }) => {
        equityAggregation.income = 0;
        equityAggregation.expenses = 0;
        equityAggregation.explicitGainLoss = 0;
      },
    );
    computePeriodHoldingGainLoss.mockResolvedValue({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      convertedCount: 0,
      skippedCount: 0,
    });
    convertBookingValueToReferenceDetails.mockImplementation(
      async ({ value }: { value: number }) => ({
        value,
        source: "identity",
      }),
    );
    getUnitToReferenceExchangeRateDetails.mockResolvedValue({
      rate: 1,
      source: "identity",
    });

    const result = await loadPeriodTimelinePointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
      metricScopeFilter: {
        metric: "liabilities",
        scope: "group:grp-liabilities",
      },
    });

    expect(result.scopedMetricValue).toBe(70);
    expect(result.scopeOptions.assets).toEqual([
      {
        value: "group:grp-assets",
        label: "Assets",
        kind: "group",
        treeLabel: "Assets",
      },
      {
        value: "account:asset-1",
        label: "Assets / Cash",
        kind: "account",
        treeLabel: "Cash",
        parentValue: "group:grp-assets",
      },
    ]);
    expect(result.scopeOptions.liabilities).toEqual([
      {
        value: "group:grp-liabilities",
        label: "Liabilities",
        kind: "group",
        treeLabel: "Liabilities",
      },
      {
        value: "account:liability-1",
        label: "Liabilities / Credit Card",
        kind: "account",
        treeLabel: "Credit Card",
        parentValue: "group:grp-liabilities",
      },
      {
        value: "group:virtual:transfer-clearing",
        label: "Transfer Clearing",
        kind: "group",
        treeLabel: "Transfer Clearing",
      },
      {
        value: "group:virtual:transfer-clearing:currency",
        label: "Transfer Clearing / Currency",
        kind: "group",
        treeLabel: "Currency",
        parentValue: "group:virtual:transfer-clearing",
      },
      {
        value: "account:virtual:transfer-clearing:account:currency:USD",
        label: "Transfer Clearing / Currency / USD",
        kind: "account",
        treeLabel: "USD",
        parentValue: "group:virtual:transfer-clearing:currency",
      },
    ]);
  });

  test("builds activity-only scope options and resolves scoped income values", async () => {
    const baseData = createBaseData({
      overrides: {
        allAccountGroups: [
          { id: "grp-income", name: "Income", parentGroupId: null },
          {
            id: "grp-income-salary",
            name: "Salary",
            parentGroupId: "grp-income",
          },
        ],
      },
    });
    getOrLoadPeriodBaseData.mockResolvedValue(baseData);
    processPeriodEquityBookingsFromBaseData.mockImplementation(
      async ({
        equityAggregation,
      }: {
        equityAggregation: {
          income: number;
          expenses: number;
          explicitGainLoss: number;
          incomeAmountByAccountId: Map<string, unknown>;
          expenseAmountByAccountId: Map<string, unknown>;
        };
      }) => {
        equityAggregation.income = 130;
        equityAggregation.expenses = 0;
        equityAggregation.explicitGainLoss = 0;
        equityAggregation.incomeAmountByAccountId.set("income-a", {
          accountId: "income-a",
          accountName: "Primary Salary",
          groupId: "grp-income-salary",
          amount: 130,
        });
      },
    );
    computePeriodHoldingGainLoss.mockResolvedValue({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      convertedCount: 0,
      skippedCount: 0,
    });
    convertBookingValueToReferenceDetails.mockResolvedValue({
      value: 1,
      source: "identity",
    });
    getUnitToReferenceExchangeRateDetails.mockResolvedValue({
      rate: 1,
      source: "identity",
    });

    const result = await loadPeriodTimelinePointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
      metricScopeFilter: {
        metric: "income",
        scope: "group:grp-income",
      },
    });

    expect(result.scopedMetricValue).toBe(130);
    expect(result.scopeOptions.income).toEqual([
      {
        value: "group:grp-income",
        label: "Income",
        kind: "group",
        treeLabel: "Income",
      },
      {
        value: "group:grp-income-salary",
        label: "Income / Salary",
        kind: "group",
        treeLabel: "Salary",
        parentValue: "group:grp-income",
      },
      {
        value: "account:income-a",
        label: "Income / Salary / Primary Salary",
        kind: "account",
        treeLabel: "Primary Salary",
        parentValue: "group:grp-income-salary",
      },
    ]);
    expect(result.scopeOptions.expenses).toEqual([]);
  });

  test("guards scoped traversal against cyclic group hierarchies", async () => {
    const baseData = createBaseData({
      overrides: {
        allAccountGroups: [
          { id: "grp-root", name: "Root", parentGroupId: null },
          { id: "grp-cycle-a", name: "Cycle A", parentGroupId: "grp-cycle-b" },
          { id: "grp-cycle-b", name: "Cycle B", parentGroupId: "grp-cycle-a" },
        ],
      },
    });
    getOrLoadPeriodBaseData.mockResolvedValue(baseData);
    processPeriodEquityBookingsFromBaseData.mockImplementation(
      async ({
        equityAggregation,
      }: {
        equityAggregation: {
          income: number;
          expenses: number;
          explicitGainLoss: number;
          incomeAmountByAccountId: Map<string, unknown>;
          expenseAmountByAccountId: Map<string, unknown>;
        };
      }) => {
        equityAggregation.income = 50;
        equityAggregation.expenses = 0;
        equityAggregation.explicitGainLoss = 0;
        equityAggregation.incomeAmountByAccountId.set("income-cycle", {
          accountId: "income-cycle",
          accountName: "Cycle Income",
          groupId: "grp-cycle-a",
          amount: 50,
        });
      },
    );
    computePeriodHoldingGainLoss.mockResolvedValue({
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      convertedCount: 0,
      skippedCount: 0,
    });
    convertBookingValueToReferenceDetails.mockResolvedValue({
      value: 1,
      source: "identity",
    });
    getUnitToReferenceExchangeRateDetails.mockResolvedValue({
      rate: 1,
      source: "identity",
    });

    const result = await loadPeriodTimelinePointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
      metricScopeFilter: {
        metric: "income",
        scope: "group:grp-root",
      },
    });

    expect(result.scopedMetricValue).toBe(0);
    const optionValues = result.scopeOptions.income.map(
      (option) => option.value,
    );
    expect(optionValues).toHaveLength(3);
    expect(optionValues).toEqual(
      expect.arrayContaining([
        "group:grp-cycle-a",
        "group:grp-cycle-b",
        "account:income-cycle",
      ]),
    );
  });
});
