import {
  accumulateGainLossContribution,
  type GainLossContributionAccumulator,
} from "./period-gains-losses-contributions";
import { describe, expect, it } from "vitest";
import { AccountType, AssetClass, Unit } from "../../../.prisma-client/enums";
import { toMoney, moneySum } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
import { buildGainLossAccountAttribution } from "./period-gain-loss-attribution";
import {
  buildGainsLossesBreakdown,
  type PeriodGainsLossesContribution,
} from "./period-gains-losses-breakdown";
import {
  normalizeGainLossScope,
  parseHistoryScopeSelection,
} from "../../../shared/history-scope";
import { buildHistoryGainLossScopeOptions } from "../history/period-history-scopes.server";

const account = (id: string, assetClass: AssetClass | null) => ({
  id,
  name: id,
  assetClass,
  type: AccountType.LIABILITY,
  groupId: null,
  unit: Unit.CURRENCY,
  currency: "CHF",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
  isCashAccount: false,
});
const contribution = (
  accountId: string,
  sourceKind: "HOLDING" | "EXPLICIT",
  amount: string,
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

describe("asset-class gain/loss attribution", () => {
  it("retains recorded reference-currency amounts, mixed cancellation, liabilities and unattributed amounts", () => {
    const metadata = buildGainLossAccountAttribution({
      baseAssetLiabilityAccounts: [
        account("mixed", AssetClass.EQUITIES),
        account("other", AssetClass.OTHER_ASSETS),
        account("missing", null),
      ],
      transferClearingUnitBuckets: [],
      executionResidualTransactions: [],
    });
    const hierarchy = buildGainsLossesBreakdown({
      referenceCurrency: "CHF",
      accountAttributionById: metadata,
      contributions: [
        contribution("mixed", "HOLDING", "-10"),
        contribution("mixed", "EXPLICIT", "10"),
        contribution("other", "EXPLICIT", "5.12"),
        contribution("missing", "EXPLICIT", "-2.12"),
        contribution(
          "explicit-unattributed:missing-counterpart",
          "EXPLICIT",
          "3",
        ),
      ],
    }).hierarchy;
    expect(hierarchy.map((node) => node.label)).toEqual([
      "Equities",
      "Other Assets",
      "Unclassified",
    ]);
    expect(toNumericMoney(hierarchy[0]!.children[0])).toMatchObject({
      totalGainLoss: 0,
      account: {
        id: "mixed",
        sources: ["HOLDING", "EXPLICIT"],
        recordedGainLoss: 10,
        calculatedRealizedGainLoss: -10,
      },
    });
    expect(
      moneySum(hierarchy.map((node) => node.totalGainLoss)).toString(),
    ).toBe("6");
    expect(hierarchy[2]!.children).toHaveLength(2);
    const options = buildHistoryGainLossScopeOptions({ hierarchy });
    expect(normalizeGainLossScope("explicit-account:mixed", options)).toBe(
      "gain-loss-account:mixed",
    );
    expect(normalizeGainLossScope("unit-account:fx:CHF:mixed", options)).toBe(
      "gain-loss-account:mixed",
    );
    for (const scope of [
      "unit-type:fx",
      "unit:fx:CHF",
      "explicit-account:unknown",
      "unit-account:fx:USD:mixed",
    ] as const)
      expect(normalizeGainLossScope(scope, options)).toBe("total");
    expect(parseHistoryScopeSelection("gain-loss-account:  ")).toBeUndefined();
    expect(
      normalizeGainLossScope(
        "unit-account:fx:USD:virtual:transfer-clearing:account:currency:USD",
        [],
      ),
    ).toBe("gain-loss-account:virtual:transfer-clearing:account:currency:USD");
    expect(
      normalizeGainLossScope(
        "unit-account:fx:EUR:virtual:transfer-clearing:account:currency:USD",
        [],
      ),
    ).toBe("total");
    expect(
      normalizeGainLossScope(
        "explicit-account:explicit-unattributed:missing-counterpart",
        [],
      ),
    ).toBe("gain-loss-account:explicit-unattributed:missing-counterpart");
    expect(parseHistoryScopeSelection("asset-class:EQUITIES")).toBe(
      "asset-class:EQUITIES",
    );
  });

  it("retains ambiguity when residuals from different originating accounts are combined", () => {
    const byKey = new Map<string, GainLossContributionAccumulator>();
    for (const [origin, amount] of [
      ["first", "2.25"],
      ["second", "3.75"],
    ] as const) {
      accumulateGainLossContribution({
        byKey,
        ...contribution("expense", "HOLDING", amount),
        originatingAccountIds: [origin],
      });
    }
    expect(byKey.size).toBe(1);
    expect([...byKey.values()][0]!.realizedGainLoss.toString()).toBe("6");
    const result = buildGainLossAccountAttribution(
      {
        baseAssetLiabilityAccounts: [
          account("first", AssetClass.EQUITIES),
          account("second", AssetClass.OTHER_ASSETS),
        ],
        transferClearingUnitBuckets: [],
        executionResidualTransactions: [],
      },
      [...byKey.values()],
    );
    expect(result.get("expense")).toMatchObject({ assetClass: null });
  });

  it("uses a unique origin for virtual clearing and residuals, retaining pooled amounts as Unclassified", () => {
    const booking = {
      id: "leg",
      date: new Date("2026-02-01"),
      value: toMoney(1),
      unit: Unit.CURRENCY,
      currency: "USD",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    };
    const bucket = {
      unitKey: "currency:USD",
      unitLabel: "USD",
      unitType: "currency" as const,
      unit: Unit.CURRENCY,
      currency: "USD",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      isNonReferenceUnit: true,
      rawBalance: toMoney(1),
    };
    const inputs = {
      baseAssetLiabilityAccounts: [
        account("origin", AssetClass.EQUITIES),
        account("second", AssetClass.EQUITIES),
      ],
      transferClearingUnitBuckets: [
        {
          ...bucket,
          bookings: [{ ...booking, originatingAccountIds: ["origin"] }],
        },
      ],
      executionResidualTransactions: [
        {
          id: "tx",
          bookings: [
            { ...booking, accountId: "origin", account: { name: "Origin" } },
            { ...booking, accountId: "expense", account: { name: "Expense" } },
          ],
        },
      ],
    };
    const unique = buildGainLossAccountAttribution(inputs, [
      { accountId: "expense", originatingAccountIds: ["origin"] },
    ]);
    expect(
      unique.get("virtual:transfer-clearing:account:currency:USD"),
    ).toMatchObject({
      assetClass: AssetClass.EQUITIES,
      kind: "transferClearing",
    });
    expect(unique.get("expense")).toMatchObject({
      assetClass: AssetClass.EQUITIES,
      kind: "unattributed",
    });
    inputs.transferClearingUnitBuckets[0]!.bookings.push({
      ...booking,
      originatingAccountIds: ["second"],
    });
    inputs.executionResidualTransactions[0]!.bookings.push({
      ...booking,
      accountId: "second",
      account: { name: "Second" },
    });
    expect(
      buildGainLossAccountAttribution(inputs, [
        { accountId: "expense", originatingAccountIds: ["origin"] },
      ]).get("expense")?.assetClass,
    ).toBe(AssetClass.EQUITIES);
    const pooled = buildGainLossAccountAttribution(inputs, [
      { accountId: "expense", originatingAccountIds: ["origin", "second"] },
    ]);
    expect(pooled.get("expense")).toMatchObject({ assetClass: null });
    expect(
      pooled.get("virtual:transfer-clearing:account:currency:USD"),
    ).toMatchObject({
      assetClass: null,
      explanation: expect.stringContaining("Unclassified"),
    });
    const hierarchy = buildGainsLossesBreakdown({
      referenceCurrency: "CHF",
      accountAttributionById: pooled,
      contributions: [
        contribution("expense", "HOLDING", "-7"),
        contribution(
          "virtual:transfer-clearing:account:currency:USD",
          "HOLDING",
          "4",
        ),
      ],
    }).hierarchy;
    expect(hierarchy[0]!.label).toBe("Unclassified");
    expect(hierarchy[0]!.totalGainLoss.toString()).toBe("-3");
  });
});
