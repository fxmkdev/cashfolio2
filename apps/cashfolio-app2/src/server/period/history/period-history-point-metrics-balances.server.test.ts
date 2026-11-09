import { beforeEach, describe, expect, test } from "vitest";
import { AccountType, Unit } from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
import {
  computePeriodHoldingGainLoss,
  convertBookingValueToReferenceDetails,
  createBaseData,
  getOrLoadPeriodBaseData,
  getUnitToReferenceExchangeRateDetails,
  loadPeriodHistoryPointMetrics,
  processPeriodEquityBookingsFromBaseData,
  resetHistoryMetrics,
} from "./period-history-point-metrics.server.test-support";

describe("loadPeriodHistoryPointMetrics", () => {
  beforeEach(resetHistoryMetrics);

  test("computes assets, liabilities, and net worth from end-of-period balances", async () => {
    const baseData = createBaseData({
      overrides: {
        baseAssetLiabilityAccounts: [
          {
            id: "asset-1",
            name: "Cash",
            groupId: null,
            type: AccountType.BALANCE,
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            assetClassId: null,
            isCashAccount: false,
          },
          {
            id: "liability-1",
            name: "Credit Card",
            groupId: null,
            type: AccountType.BALANCE,
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            assetClassId: null,
            isCashAccount: false,
          },
        ],
        endOfPeriodRawBalances: [
          { accountId: "asset-1", rawBalance: toMoney(200) },
          { accountId: "liability-1", rawBalance: toMoney(-70) },
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
            rawBalance: toMoney(-50),
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
      realizedGainLoss: toMoney(0),
      unrealizedGainLoss: toMoney(0),
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
      rate: toMoney(1),
      source: "identity",
    });

    const result = await loadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(toNumericMoney(result)).toEqual({
      totalReturn: 0,
      savings: 0,
      cashFlow: 0,
      income: 0,
      expenses: 0,
      gainsLosses: 0,
      assets: 250,
      liabilities: 70,
      netWorth: 180,
      scopeOptions: {
        cashFlow: [],
        income: [],
        expenses: [],
        gainsLosses: [],
        netWorth: [
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
      },
      scopedMetricValue: undefined,
    });
  });

  test("builds virtual balance scope options and resolves signed Net Worth values", async () => {
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
            type: AccountType.BALANCE,
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            assetClassId: null,
            isCashAccount: false,
          },
          {
            id: "liability-1",
            name: "Credit Card",
            groupId: "grp-liabilities",
            type: AccountType.BALANCE,
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            assetClassId: null,
            isCashAccount: false,
          },
        ],
        endOfPeriodRawBalances: [
          { accountId: "asset-1", rawBalance: toMoney(200) },
          { accountId: "liability-1", rawBalance: toMoney(-70) },
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
            rawBalance: toMoney(50),
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
      realizedGainLoss: toMoney(0),
      unrealizedGainLoss: toMoney(0),
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
      rate: toMoney(1),
      source: "identity",
    });

    const result = await loadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-02",
      metricScopeFilter: {
        metric: "netWorth",
        scope: "group:grp-liabilities",
      },
    });

    expect(toNumericMoney(result.scopedMetricValue)).toBe(-70);
    expect(toNumericMoney(result.scopeOptions.netWorth)).toEqual([
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
});
