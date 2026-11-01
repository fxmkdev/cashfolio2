import { describe, expect, it } from "vitest";
import { defaultAssetClassIds } from "../../../shared/asset-class";
import { Unit } from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
import { buildGainLossAccountAttribution } from "./period-gain-loss-attribution";
import {
  buildGainsLossesBreakdown,
  type PeriodGainsLossesContribution,
} from "./period-gains-losses-breakdown";
import type { PeriodBaseAssetLiabilityAccount } from "../base-data/period-base-data-types";
import {
  buildHistoryGainLossScopeOptions,
  resolveScopedMetricValue,
} from "../history/period-history-scopes.server";
import {
  normalizeGainLossScope,
  parseHistoryScopeSelection,
} from "../../../shared/history-scope";

const account = (
  id: string,
  overrides: Partial<PeriodBaseAssetLiabilityAccount> = {},
): PeriodBaseAssetLiabilityAccount => ({
  id,
  name: id,
  groupId: null,
  type: "BALANCE",
  assetClassId: defaultAssetClassIds.EQUITIES,
  trackingMethod: "INDIVIDUAL_UNITS",
  unit: Unit.CURRENCY,
  currency: "USD",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
  isCashAccount: false,
  ...overrides,
});
const contribution = (
  id: string,
  amount: string,
  overrides: Partial<PeriodGainsLossesContribution> = {},
): PeriodGainsLossesContribution => ({
  accountId: id,
  accountName: id,
  sourceKind: "HOLDING",
  unit: Unit.CURRENCY,
  currency: "USD",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
  realizedGainLoss: toMoney(amount),
  unrealizedGainLoss: toMoney(0),
  ...overrides,
});
function build(
  accounts: PeriodBaseAssetLiabilityAccount[],
  contributions: PeriodGainsLossesContribution[],
) {
  return buildGainsLossesBreakdown({
    referenceCurrency: "CHF",
    contributions,
    accountAttributionById: buildGainLossAccountAttribution({
      baseAssetLiabilityAccounts: accounts,
      transferClearingUnitBuckets: [],
      executionResidualTransactions: [],
    }),
  }).hierarchy;
}

describe("gain/loss investment grouping", () => {
  it("combines units within a class and symbols across trade currencies, using financial-account identity", () => {
    const accounts = [
      account("usd-a"),
      account("usd-b"),
      account("other-class", {
        assetClassId: defaultAssetClassIds.OTHER_ASSETS,
      }),
      ...["USD", "EUR"].map((tradeCurrency) =>
        account(`aapl-${tradeCurrency}`, {
          unit: Unit.SECURITY,
          currency: null,
          symbol: " aapl ",
          tradeCurrency,
        }),
      ),
      account("crypto", {
        unit: Unit.CRYPTOCURRENCY,
        currency: null,
        cryptocurrency: " usd ",
      }),
    ];
    const hierarchy = build(
      accounts,
      accounts.map((a) =>
        contribution(a.id, "1.005", {
          sourceKind: "EXPLICIT",
          currency: "CHF",
        }),
      ),
    );
    const equities = hierarchy[0]!;
    expect(toNumericMoney(equities)).toMatchObject({
      totalGainLoss: 5.02,
      children: [
        {
          id: "gain-loss-investment:EQUITIES:SECURITY:AAPL",
          label: "AAPL",
          totalGainLoss: 2.01,
          children: [
            { id: "gain-loss-account:aapl-EUR" },
            { id: "gain-loss-account:aapl-USD" },
          ],
        },
        {
          id: "gain-loss-investment:EQUITIES:CRYPTOCURRENCY:USD",
          label: "USD",
          totalGainLoss: 1,
        },
        {
          id: "gain-loss-investment:EQUITIES:CURRENCY:USD",
          label: "USD",
          totalGainLoss: 2.01,
        },
      ],
    });
    expect(hierarchy[1]!.children[0]!.id).toBe(
      "gain-loss-investment:OTHER_ASSETS:CURRENCY:USD",
    );
    // Group sums use original precision, not the independently rounded leaves.
    expect(
      equities.children[2]!.children.map((node) =>
        node.totalGainLoss.toString(),
      ),
    ).toEqual(["1", "1"]);
  });

  it("keeps managed portfolios' recorded performance and FX together, including cancellation", () => {
    const accounts = [
      account("foreign", { trackingMethod: "TOTAL_PORTFOLIO_VALUE" }),
      account("reference", {
        trackingMethod: "TOTAL_PORTFOLIO_VALUE",
        currency: "CHF",
      }),
      account("cash"),
    ];
    const hierarchy = build(accounts, [
      contribution("foreign", "10"),
      contribution("foreign", "-10", { sourceKind: "EXPLICIT" }),
      contribution("reference", "3", {
        sourceKind: "EXPLICIT",
        currency: "CHF",
      }),
      contribution("cash", "7"),
    ]);
    expect(toNumericMoney(hierarchy)).toMatchObject([
      {
        totalGainLoss: 10,
        children: [
          {
            label: "Total Value Accounts",
            totalGainLoss: 3,
            children: [
              {
                id: "gain-loss-account:foreign",
                totalGainLoss: 0,
                account: {
                  recordedGainLoss: -10,
                  calculatedRealizedGainLoss: 10,
                },
              },
              { id: "gain-loss-account:reference", totalGainLoss: 3 },
            ],
          },
          { label: "USD", totalGainLoss: 7 },
        ],
      },
    ]);
    const scope = "gain-loss-investment:EQUITIES:managed-portfolios";
    expect(parseHistoryScopeSelection(scope)).toBe(scope);
    expect(
      parseHistoryScopeSelection("gain-loss-investment:  "),
    ).toBeUndefined();
    const options = buildHistoryGainLossScopeOptions({ hierarchy });
    expect(normalizeGainLossScope(scope, options)).toBe(scope);
    expect(
      options.find((o) => o.value === "gain-loss-account:foreign"),
    ).toMatchObject({ parentValue: scope, accountId: "foreign" });
    expect(
      resolveScopedMetricValue({
        metricScopeFilter: { metric: "gainsLosses", scope },
        amountByMetric: {},
        allAccountGroups: [],
        gainsLossesHierarchy: hierarchy,
      })?.toString(),
    ).toBe("3");
  });

  it("retains ambiguous synthetic accounts under Unknown Unit, while known holding units remain visible", () => {
    const hierarchy = build(
      [],
      [
        contribution("residual", "1"),
        contribution("residual", "2", { currency: "EUR" }),
        contribution("legacy-recorded", "3", { sourceKind: "EXPLICIT" }),
        contribution("clearing", "4"),
      ],
    );
    expect(toNumericMoney(hierarchy)).toMatchObject([
      {
        label: "Unclassified",
        totalGainLoss: 10,
        children: [
          {
            label: "Unknown Unit",
            totalGainLoss: 6,
            children: [{ label: "legacy-recorded" }, { label: "residual" }],
          },
          { label: "USD", totalGainLoss: 4 },
        ],
      },
    ]);
  });
});
