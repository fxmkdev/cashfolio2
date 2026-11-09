import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  cleanupHistory,
  getPeriodHistory,
  loadHistoryOpeningBalancePoint,
  loadPeriodHistoryPoint,
  loadPeriodHistoryPointContext,
  resetHistory,
} from "./period-history.test-support";

describe("getPeriodHistory", () => {
  beforeEach(resetHistory);
  afterEach(cleanupHistory);

  test("retains zero-only scopes and empty groups from the request hierarchy", async () => {
    const original = loadPeriodHistoryPointContext.getMockImplementation()!;
    loadPeriodHistoryPointContext.mockImplementation(async (args) => ({
      ...(await original(args)),
      netWorthScopes: [
        {
          value: "group:empty",
          label: "Empty",
          kind: "group",
          treeLabel: "Empty",
        },
        {
          value: "account:zero",
          label: "Zero",
          kind: "account",
          treeLabel: "Zero",
        },
      ],
    }));
    const point = loadPeriodHistoryPoint.getMockImplementation()!;
    loadPeriodHistoryPoint.mockImplementation(async (args) => ({
      ...(await point(args)),
      scopedMetricValue: 0,
    }));
    loadHistoryOpeningBalancePoint.mockResolvedValueOnce({
      date: "2026-01-04T00:00:00Z",
      label: "Opening Balance",
      assets: 150,
      liabilities: 40,
      netWorth: 110,
      scopedMetricValue: 0,
    });
    const result = await getPeriodHistory({
      data: {
        accountBookId: "book-1",
        granularity: "month",
        scopedMetric: "netWorth",
        netWorthScope: "account:zero",
      },
    });
    expect(result.scopeSelection.netWorth).toBe("account:zero");
    expect(result.points.map((point) => point.netWorth)).toEqual([0, 0, 0]);
    expect(result.openingBalancePoint?.netWorth).toBe(0);
    expect(result.scopeOptions.netWorth.map((option) => option.value)).toEqual([
      "total",
      "group:asset-g",
      "group:empty",
      "account:liability-a",
      "account:zero",
    ]);
    expect(loadPeriodHistoryPointContext).toHaveBeenCalledTimes(1);
  });

  test("keeps merged Gain/Loss scopes in asset-class order", async () => {
    const original = loadPeriodHistoryPoint.getMockImplementation()!;
    loadPeriodHistoryPoint.mockImplementation(async (args) => {
      const point = await original(args);
      const assetClassId =
        args.period === "2026-01"
          ? "unclassified"
          : args.period === "2026-02"
            ? "EQUITIES"
            : "CASH_AND_CASH_EQUIVALENTS";
      return {
        ...point,
        scopeOptions: {
          ...point.scopeOptions,
          gainsLosses: [
            {
              value: `asset-class:${assetClassId}`,
              label: assetClassId,
              kind: "gainLoss",
            },
            {
              value: `gain-loss-account:${assetClassId}`,
              label: `${assetClassId} / Account`,
              kind: "gainLoss",
              parentValue: `asset-class:${assetClassId}`,
            },
          ],
        },
      };
    });
    const result = await getPeriodHistory({
      data: { accountBookId: "book-1", granularity: "month" },
    });
    expect(
      result.scopeOptions.gainsLosses.map((option) => option.value),
    ).toEqual([
      "total",
      "asset-class:CASH_AND_CASH_EQUIVALENTS",
      "gain-loss-account:CASH_AND_CASH_EQUIVALENTS",
      "asset-class:EQUITIES",
      "gain-loss-account:EQUITIES",
      "asset-class:unclassified",
      "gain-loss-account:unclassified",
    ]);
  });

  test("unions Account Structure G/L scopes across periods and keeps missing points at zero", async () => {
    const original = loadPeriodHistoryPoint.getMockImplementation()!;
    loadPeriodHistoryPoint.mockImplementation(async (args) => {
      const point = await original(args);
      return {
        ...point,
        scopedMetricValue: args.period === "2026-01" ? 12 : 0,
        scopeOptions: {
          ...point.scopeOptions,
          gainsLosses: [
            ...point.scopeOptions.gainsLosses,
            ...(args.period === "2026-01"
              ? [
                  {
                    value: "group:pension",
                    label: "Pension",
                    kind: "gainLoss",
                    grouping: "accountStructure",
                  },
                  {
                    value: "account:portfolio",
                    label: "Pension / Portfolio",
                    kind: "gainLoss",
                    grouping: "accountStructure",
                    accountId: "portfolio",
                    parentValue: "group:pension",
                  },
                ]
              : []),
          ],
        },
      };
    });
    const result = await getPeriodHistory({
      data: {
        accountBookId: "book-1",
        granularity: "month",
        scopedMetric: "gainsLosses",
        gainLossScope: "group:pension",
      },
    });
    expect(result.scopeSelection.gainsLosses).toBe("group:pension");
    expect(result.points.map((point) => point.gainsLosses)).toEqual([12, 0, 0]);
    expect(result.scopeOptions.gainsLosses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "account:portfolio",
          grouping: "accountStructure",
        }),
        expect.objectContaining({
          value: "asset-class:CASH_AND_CASH_EQUIVALENTS",
        }),
      ]),
    );
    expect(loadPeriodHistoryPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        metricScopeFilter: { metric: "gainsLosses", scope: "group:pension" },
      }),
    );
  });

  test.each([
    ["asset-class:child", "asset-class:child"],
    ["asset-class:deleted", "total"],
    ["gain-loss-investment:deleted:managed-portfolios", "total"],
  ] as const)(
    "uses current hierarchy metadata to normalize %s",
    async (requested, expected) => {
      const original = loadPeriodHistoryPoint.getMockImplementation()!;
      loadPeriodHistoryPoint.mockImplementation(async (args) => {
        const point = await original(args);
        return {
          ...point,
          scopeOptions: { ...point.scopeOptions, gainsLosses: [] },
        };
      });
      loadPeriodHistoryPointContext.mockResolvedValueOnce({
        referenceCurrency: "CHF",
        accountBookStartDate: new Date("2026-01-05T00:00:00.000Z"),
        holdingAccountsResolved: [],
        netWorthScopes: [],
        hasCashAccounts: true,
        assetClassScopes: [
          {
            value: "asset-class:z",
            label: "Z First",
            treeLabel: "Z First",
            kind: "gainLoss",
            sortOrder: 0,
          },
          {
            value: "asset-class:child",
            label: "Z First / Child",
            treeLabel: "Child",
            kind: "gainLoss",
            parentValue: "asset-class:z",
            sortOrder: 0,
          },
          {
            value: "asset-class:a",
            label: "A Last",
            treeLabel: "A Last",
            kind: "gainLoss",
            sortOrder: 1,
          },
        ],
      });
      const result = await getPeriodHistory({
        data: {
          accountBookId: "book-1",
          granularity: "month",
          scopedMetric: "gainsLosses",
          gainLossScope: requested,
        },
      });
      expect(result.scopeSelection.gainsLosses).toBe(expected);
      if (expected === "total")
        expect(result.points.every((point) => point.gainsLosses === 11)).toBe(
          true,
        );
      expect(
        result.scopeOptions.gainsLosses
          .filter((o) => o.value.startsWith("asset-class:"))
          .map((o) => o.value),
      ).toEqual(["asset-class:z", "asset-class:child", "asset-class:a"]);
      expect(
        loadPeriodHistoryPoint.mock.calls[0]?.[0].metricScopeFilter,
      ).toEqual(
        requested === "asset-class:deleted"
          ? undefined
          : { metric: "gainsLosses", scope: requested },
      );
    },
  );
});
