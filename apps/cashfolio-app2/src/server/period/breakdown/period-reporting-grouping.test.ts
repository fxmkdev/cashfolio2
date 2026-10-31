import { defaultAssetClassIds } from "../../../shared/asset-class";
import { describe, expect, it } from "vitest";
import { AccountType, Unit } from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
import { buildPeriodEndAllocationBreakdown } from "./period-allocation-breakdown";
import {
  buildGainsLossesBreakdown,
  type PeriodGainsLossesContribution,
} from "./period-gains-losses-breakdown";
import {
  buildHistoryGainLossScopeOptions,
  resolveScopedMetricValue,
} from "../history/period-history-scopes.server";
import { buildGainLossAccountAttribution } from "./period-gain-loss-attribution";
import { prepareGainLossStructure } from "../period-calculation-context";

const groups = [
  { id: "investments", name: "Investments", parentGroupId: null },
  { id: "pension", name: "Pension", parentGroupId: "investments" },
];
const groupById = new Map(groups.map((group) => [group.id, group]));
const contribution = (
  accountId: string,
  amount: string,
  sourceKind: "HOLDING" | "EXPLICIT" = "HOLDING",
): PeriodGainsLossesContribution => ({
  accountId,
  accountName: accountId,
  sourceKind,
  unit: Unit.CURRENCY,
  currency: "CHF",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
  realizedGainLoss: toMoney(amount),
  unrealizedGainLoss: toMoney(0),
});

describe("reporting grouping", () => {
  it("preserves allocation totals with nested classes, direct parent accounts, and custom order", () => {
    const items = [
      {
        accountId: "direct",
        accountName: "Direct",
        assetClassId: "equities",
        amount: "3",
      },
      {
        accountId: "child",
        accountName: "Archived Child",
        assetClassId: "pension",
        amount: "7",
      },
      {
        accountId: "other",
        accountName: "Other",
        assetClassId: null,
        amount: "2",
      },
    ].map(({ amount, ...item }) => ({
      ...item,
      groupId: null,
      accountType: AccountType.BALANCE,
      convertedBalanceInReferenceCurrency: toMoney(amount),
    }));
    const assetClasses = [
      { id: "equities", name: "Equities", parentId: null, sortOrder: 0 },
      { id: "pension", name: "Pension", parentId: "equities", sortOrder: 0 },
    ];
    const before = toNumericMoney(
      buildPeriodEndAllocationBreakdown({
        side: "asset",
        grouping: "assetClass",
        items,
        groupById,
        assetClasses,
      }),
    );
    expect(before.totalAmount).toBe(12);
    expect(before.hierarchy[0]).toMatchObject({
      id: "asset-class:equities",
      amount: 10,
    });
    expect(before.hierarchy[0].children.map((node) => node.id)).toEqual([
      "asset-class:pension",
      "allocation-investment:equities:unknown",
    ]);
    const after = toNumericMoney(
      buildPeriodEndAllocationBreakdown({
        side: "asset",
        grouping: "assetClass",
        items,
        groupById,
        assetClasses: assetClasses.map((node) =>
          node.id === "pension"
            ? { ...node, parentId: null, name: "Retirement", sortOrder: -1 }
            : node,
        ),
      }),
    );
    expect(after.totalAmount).toBe(before.totalAmount);
    expect(after.hierarchy.map((node) => node.id)).toEqual([
      "asset-class:pension",
      "asset-class:equities",
      "asset-class:unclassified",
    ]);
    expect(after.hierarchy[0]).toMatchObject({
      label: "Retirement",
      amount: 7,
    });
  });
  it("groups classes across nested, ungrouped and archived accounts while preserving signs and raw totals", () => {
    const items = [
      {
        accountId: "broker",
        accountName: "Broker",
        groupId: "investments",
        assetClassId: defaultAssetClassIds.EQUITIES,
        balance: "0.006",
      },
      {
        accountId: "pension",
        accountName: "Archived Pension",
        groupId: "pension",
        assetClassId: defaultAssetClassIds.EQUITIES,
        balance: "0.006",
        isActive: false,
      },
      {
        accountId: "cash",
        accountName: "Cash",
        groupId: null,
        assetClassId: null,
        balance: "10",
      },
      {
        accountId: "debt",
        accountName: "Debt",
        groupId: "pension",
        assetClassId: defaultAssetClassIds.EQUITIES,
        balance: "-3",
      },
      {
        accountId: "missing",
        accountName: "Missing",
        groupId: null,
        assetClassId: null,
        balance: null,
      },
    ].map(({ balance, ...item }) => ({
      ...item,
      accountType: AccountType.BALANCE,
      convertedBalanceInReferenceCurrency:
        balance == null ? null : toMoney(balance),
    }));
    for (const side of ["asset", "liability"] as const) {
      const structure = toNumericMoney(
        buildPeriodEndAllocationBreakdown({
          side,
          items,
          groupById,
          grouping: "accountStructure",
        }),
      );
      const classes = toNumericMoney(
        buildPeriodEndAllocationBreakdown({
          side,
          items,
          groupById,
          grouping: "assetClass",
        }),
      );
      expect(structure.totalAmount).toBe(side === "asset" ? 10.01 : 3);
      expect(classes.totalAmount).toBe(structure.totalAmount);
      expect(classes.skippedMissingReferenceBalanceCount).toBe(1);
      expect(structure.skippedMissingReferenceBalanceCount).toBe(1);
      expect(classes.hierarchy[0].id).toBe("asset-class:EQUITIES");
      if (side === "asset") {
        expect(classes.hierarchy[0].children[0].id).toBe(
          "allocation-investment:EQUITIES:unknown",
        );
        expect(
          classes.hierarchy[0].children[0].children.map((node) => node.id),
        ).toEqual(["account:pension", "account:broker"]);
        expect(classes.hierarchy[1].id).toBe("asset-class:unclassified");
        expect(
          structure.hierarchy.find((node) => node.id === "group:investments")
            ?.children,
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: "group:pension" }),
          ]),
        );
      }
    }
  });

  it("retains allocation discrepancy metadata when small children disappear in either grouping", () => {
    const items = ["0.006", "0.004", "0.004", "0.004"].map((amount, i) => ({
      accountId: String(i),
      accountName: String(i),
      groupId: "investments",
      accountType: AccountType.BALANCE,
      assetClassId: defaultAssetClassIds.EQUITIES,
      convertedBalanceInReferenceCurrency: toMoney(amount),
    }));
    for (const grouping of ["accountStructure", "assetClass"] as const) {
      const result = buildPeriodEndAllocationBreakdown({
        side: "asset",
        grouping,
        items,
        groupById,
      });
      expect(result.hasHiddenAmountDiscrepancy).toBe(true);
      expect(result.hiddenAmountDiscrepancyNodeIds).toContain(
        grouping === "assetClass"
          ? "asset-class:EQUITIES"
          : "group:investments",
      );
    }
  });

  it("aggregates G/L before rounding and resolves both History lenses from the same contributions", () => {
    const accounts = [
      { id: "broker", groupId: "investments" },
      { id: "pension", groupId: "pension" },
      { id: "cash", groupId: null },
    ];
    const contributions = [
      contribution("broker", "0.005"),
      contribution("pension", "0.005"),
      contribution("cash", "-2"),
    ];
    const accountAttributionById = new Map(
      accounts.map(({ id }) => [
        id,
        {
          assetClassId: id === "cash" ? null : defaultAssetClassIds.EQUITIES,
          kind: "account" as const,
          explanation: null,
        },
      ]),
    );
    const args = {
      contributions,
      accounts,
      groupById,
      accountAttributionById,
      referenceCurrency: "CHF",
    };
    const structure = buildGainsLossesBreakdown({
      ...args,
      grouping: "accountStructure",
    });
    const classes = buildGainsLossesBreakdown({
      ...args,
      grouping: "assetClass",
    });
    expect(structure.totalGainLoss.toString()).toBe("-1.99");
    expect(classes.totalGainLoss.toString()).toBe(
      structure.totalGainLoss.toString(),
    );
    expect(
      structure.hierarchy
        .find((node) => node.id === "group:investments")
        ?.totalGainLoss.toString(),
    ).toBe("0.01");
    for (const [scope, expected] of [
      ["group:investments", "0.01"],
      ["group:pension", "0"],
      ["asset-class:EQUITIES", "0.01"],
      ["account:cash", "-2"],
      ["gain-loss-account:cash", "-2"],
      ["account:absent", "0"],
    ] as const) {
      expect(
        resolveScopedMetricValue({
          metricScopeFilter: { metric: "gainsLosses", scope },
          amountByMetric: {},
          allAccountGroups: groups,
          gainsLossesHierarchy: classes.hierarchy,
          accountStructureGainsLossesHierarchy: structure.hierarchy,
        })?.toString(),
      ).toBe(expected);
    }
    const options = buildHistoryGainLossScopeOptions({
      hierarchy: structure.hierarchy,
      grouping: "accountStructure",
    });
    expect(
      options.find((option) => option.value === "account:pension"),
    ).toMatchObject({
      grouping: "accountStructure",
      accountId: "pension",
      parentValue: "group:pension",
    });
  });

  it("keeps offsetting G/L, recorded provenance, zero-balance clearing and unattributed contributions", () => {
    const baseData = {
      baseAssetLiabilityAccounts: [],
      allAccountGroups: groups,
      executionResidualTransactions: [],
      transferClearingUnitBuckets: [
        {
          unitKey: "currency:USD",
          unitLabel: "USD",
          unitType: "currency" as const,
          unit: Unit.CURRENCY,
          currency: "USD",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          isNonReferenceUnit: true,
          rawBalance: toMoney(0),
          bookings: [],
        },
      ],
    };
    const clearing = "virtual:transfer-clearing:account:currency:USD";
    const contributions = [
      contribution(clearing, "10"),
      contribution(clearing, "-10", "EXPLICIT"),
      contribution(
        "explicit-unattributed:missing-counterpart",
        "3",
        "EXPLICIT",
      ),
    ];
    const structure = toNumericMoney(
      buildGainsLossesBreakdown({
        contributions,
        referenceCurrency: "CHF",
        grouping: "accountStructure",
        accountAttributionById: buildGainLossAccountAttribution(
          baseData,
          contributions,
        ),
        ...prepareGainLossStructure(baseData),
      }),
    );
    expect(structure.totalGainLoss).toBe(3);
    const clearingRoot = structure.hierarchy.find(
      (node) => node.label === "Transfer Clearing",
    )!;
    expect(clearingRoot.totalGainLoss).toBe(0);
    expect(clearingRoot.children[0].children[0]).toMatchObject({
      id: `account:${clearing}`,
      totalGainLoss: 0,
      account: {
        sources: ["HOLDING", "EXPLICIT"],
        recordedGainLoss: -10,
        calculatedRealizedGainLoss: 10,
      },
    });
    expect(
      structure.hierarchy.find((node) => node.label === "Unattributed")
        ?.totalGainLoss,
    ).toBe(3);
  });
});
