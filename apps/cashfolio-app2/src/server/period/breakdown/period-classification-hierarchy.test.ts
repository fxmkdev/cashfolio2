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
