import { buildGainLossAccountAttribution } from "./period-gain-loss-attribution";
import type { PeriodBaseAssetLiabilityAccount } from "../base-data/period-base-data-types";
import { toNumericMoney } from "../../money-boundary";
import { normalizeGainLossScope } from "../../../shared/history-scope";
import { describe, expect, it } from "vitest";
import { Unit } from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import type { ClassificationNode } from "../../../shared/asset-class";
import {
  buildGainsLossesBreakdown,
  type PeriodGainsLossesContribution,
} from "./period-gains-losses-breakdown";
import {
  buildHistoryGainLossScopeOptions,
  resolveScopedMetricValue,
} from "../history/period-history-scopes.server";
const classes: ClassificationNode[] = [
  { id: "equities", name: "Equities", parentId: null, sortOrder: 1 },
  { id: "swiss", name: "Swiss", parentId: "equities", sortOrder: 1 },
  { id: "global", name: "Global", parentId: "equities", sortOrder: 0 },
  { id: "cash", name: "Cash", parentId: null, sortOrder: 0 },
];
function contribution(
  accountId: string,
  amount: string,
): PeriodGainsLossesContribution {
  return {
    accountId,
    accountName: accountId,
    sourceKind: "EXPLICIT",
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    realizedGainLoss: toMoney(amount),
    unrealizedGainLoss: toMoney(0),
  };
}
function build(nodes = classes) {
  return buildGainsLossesBreakdown({
    referenceCurrency: "CHF",
    assetClasses: nodes,
    contributions: [
      contribution("direct", "5"),
      contribution("swiss", "-10"),
      contribution("global", "5"),
      contribution("unknown", "2"),
    ],
    accountAttributionById: new Map([
      [
        "direct",
        {
          assetClassId: "equities",
          kind: "account" as const,
          explanation: null,
        },
      ],
      [
        "swiss",
        { assetClassId: "swiss", kind: "account" as const, explanation: null },
      ],
      [
        "global",
        { assetClassId: "global", kind: "account" as const, explanation: null },
      ],
    ]),
  }).hierarchy;
}
describe("hierarchical gain/loss classification", () => {
  it("rolls direct assignments and nested accounts up once, retaining cancellation", () => {
    const hierarchy = build();
    expect(hierarchy.map((n) => n.id)).toEqual([
      "asset-class:equities",
      "asset-class:unclassified",
    ]);
    expect(hierarchy[0]!.totalGainLoss.toString()).toBe("0");
    expect(hierarchy[0]!.children.map((n) => n.id)).toEqual([
      "asset-class:global",
      "asset-class:swiss",
      "gain-loss-investment:equities:unknown",
    ]);
    expect(hierarchy[0]!.children[2]!.children.map((node) => node.id)).toEqual([
      "gain-loss-account:direct",
    ]);
    expect(hierarchy[1]!.totalGainLoss.toString()).toBe("2");
    expect(
      resolveScopedMetricValue({
        metricScopeFilter: {
          metric: "gainsLosses",
          scope: "asset-class:swiss",
        },
        amountByMetric: {},
        allAccountGroups: [],
        gainsLossesHierarchy: hierarchy,
      })?.toString(),
    ).toBe("-10");
    expect(
      resolveScopedMetricValue({
        metricScopeFilter: { metric: "gainsLosses", scope: "total" },
        amountByMetric: {},
        allAccountGroups: [],
        gainsLossesHierarchy: hierarchy,
      })?.toString(),
    ).toBe("2");
  });
  it("updates paths on rename/reparent while retaining IDs and totals", () => {
    const moved = classes.map((n) =>
      n.id === "swiss" ? { ...n, name: "Domestic", parentId: "cash" } : n,
    );
    const hierarchy = build(moved),
      scopes = buildHistoryGainLossScopeOptions({ hierarchy });
    expect(scopes.find((s) => s.value === "asset-class:swiss")).toMatchObject({
      label: "Cash / Domestic",
      parentValue: "asset-class:cash",
    });
    expect(hierarchy.map((n) => n.id)).toEqual([
      "asset-class:cash",
      "asset-class:equities",
      "asset-class:unclassified",
    ]);
    expect(
      hierarchy.reduce((s, n) => s + Number(n.totalGainLoss.toString()), 0),
    ).toBe(2);
  });
  it("preserves decimal precision until parent totals are rounded", () => {
    const hierarchy = buildGainsLossesBreakdown({
      referenceCurrency: "CHF",
      assetClasses: classes,
      contributions: [
        contribution("one", "0.004"),
        contribution("two", "0.004"),
      ],
      accountAttributionById: new Map([
        [
          "one",
          {
            assetClassId: "swiss",
            kind: "account" as const,
            explanation: null,
          },
        ],
        [
          "two",
          {
            assetClassId: "global",
            kind: "account" as const,
            explanation: null,
          },
        ],
      ]),
    }).hierarchy;
    expect(hierarchy[0]!.totalGainLoss.toString()).toBe("0.01");
  });
});

it("combines subclass ordering and investment roll-ups without duplicating direct or archived accounts", () => {
  const account = (
    id: string,
    assetClassId: string | null,
    managed = false,
  ): PeriodBaseAssetLiabilityAccount => ({
    id,
    name: id,
    assetClassId,
    groupId: null,
    type: "BALANCE",
    isCashAccount: false,
    unit: Unit.CURRENCY,
    currency: "USD",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    trackingMethod: managed ? "TOTAL_PORTFOLIO_VALUE" : "INDIVIDUAL_UNITS",
  });
  const accounts = [
    account("direct", "equities"),
    account("global", "global"),
    account("managed", "swiss", true),
    { ...account("archived", "swiss", true), isActive: false },
    account("unclassified", null),
  ];
  const contributions = [
    contribution("direct", "3"),
    contribution("global", "4"),
    contribution("managed", "10"),
    contribution("archived", "-10"),
    contribution("unclassified", "2"),
  ];
  const calculate = (assetClasses: ClassificationNode[]) =>
    buildGainsLossesBreakdown({
      referenceCurrency: "CHF",
      contributions,
      assetClasses,
      accountAttributionById: buildGainLossAccountAttribution({
        baseAssetLiabilityAccounts: accounts,
        assetClasses,
        transferClearingUnitBuckets: [],
        executionResidualTransactions: [],
      }),
    });
  const result = calculate(classes),
    hierarchy = toNumericMoney(result.hierarchy);
  expect(result.totalGainLoss.toString()).toBe("9");
  expect(hierarchy.map((node) => node.id)).toEqual([
    "asset-class:equities",
    "asset-class:unclassified",
  ]);
  expect(hierarchy[0]).toMatchObject({
    totalGainLoss: 7,
    children: [
      {
        id: "asset-class:global",
        totalGainLoss: 4,
        children: [{ id: "gain-loss-investment:global:CURRENCY:USD" }],
      },
      {
        id: "asset-class:swiss",
        totalGainLoss: 0,
        children: [
          {
            id: "gain-loss-investment:swiss:managed-portfolios",
            totalGainLoss: 0,
            children: [
              { id: "gain-loss-account:archived", totalGainLoss: -10 },
              { id: "gain-loss-account:managed", totalGainLoss: 10 },
            ],
          },
        ],
      },
      {
        id: "gain-loss-investment:equities:CURRENCY:USD",
        totalGainLoss: 3,
        children: [{ id: "gain-loss-account:direct" }],
      },
    ],
  });
  expect(hierarchy[1]).toMatchObject({
    totalGainLoss: 2,
    children: [
      {
        id: "gain-loss-investment:unclassified:CURRENCY:USD",
        children: [{ id: "gain-loss-account:unclassified" }],
      },
    ],
  });
  const collectAccounts = (nodes: typeof hierarchy): string[] =>
    nodes.flatMap((node) =>
      node.account ? [node.account.id] : collectAccounts(node.children),
    );
  expect(collectAccounts(hierarchy).sort()).toEqual(
    accounts.map((account) => account.id).sort(),
  );
  const investmentScope = "gain-loss-investment:swiss:managed-portfolios";
  const moved = calculate(
    classes.map((node) =>
      node.id === "swiss"
        ? { ...node, name: "Domestic", parentId: "cash" }
        : node,
    ),
  );
  expect(moved.totalGainLoss.toString()).toBe(result.totalGainLoss.toString());
  const scopes = buildHistoryGainLossScopeOptions({
    hierarchy: moved.hierarchy,
  });
  expect(scopes.find((scope) => scope.value === investmentScope)).toMatchObject(
    {
      label: "Cash / Domestic / Managed Portfolios",
      parentValue: "asset-class:swiss",
    },
  );
  expect(normalizeGainLossScope(investmentScope, scopes)).toBe(investmentScope);
  expect(
    resolveScopedMetricValue({
      metricScopeFilter: { metric: "gainsLosses", scope: investmentScope },
      amountByMetric: {},
      allAccountGroups: [],
      gainsLossesHierarchy: moved.hierarchy,
    })?.toString(),
  ).toBe("0");
  const deleted = calculate(classes.filter((node) => node.id !== "swiss"));
  expect(deleted.totalGainLoss.toString()).toBe("9");
  expect(
    buildHistoryGainLossScopeOptions({ hierarchy: deleted.hierarchy }).some(
      (option) => option.value === investmentScope,
    ),
  ).toBe(false);
  expect(
    resolveScopedMetricValue({
      metricScopeFilter: { metric: "gainsLosses", scope: investmentScope },
      amountByMetric: {},
      allAccountGroups: [],
      gainsLossesHierarchy: deleted.hierarchy,
    })?.toString(),
  ).toBe("0");
});
