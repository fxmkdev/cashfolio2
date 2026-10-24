import { describe, expect, it, vi } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";
import { toMoney, moneyMultiply, type Money } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import { computeEndOfPeriodBalanceStatsWithConvertedBalances } from "./period-balance-stats";
import { buildPeriodEndAllocationBreakdown } from "./breakdown/period-allocation-breakdown";
import {
  buildBalanceHistoryScopeAmountMaps,
  buildHistoryScopeOptions,
  resolveScopedMetricValue,
} from "./history/period-history-scopes.server";
import { buildTransferClearingVirtualHierarchy } from "./transfer-clearing/period-transfer-clearing-hierarchy";

vi.mock("../../prisma.server", () => ({ prisma: {} }));

const groups = [
  { id: "banking", name: "Banking", parentGroupId: null },
  { id: "cards", name: "Cards", parentGroupId: "banking" },
];
const groupById = new Map(groups.map((group) => [group.id, group]));

function account(id: string, type: AccountType, currency = "CHF") {
  return {
    id,
    name: id,
    type,
    groupId: "cards",
    unit: Unit.CURRENCY,
    currency,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
  };
}

async function compute(
  accounts: ReturnType<typeof account>[],
  balances: Map<string, Money>,
) {
  return computeEndOfPeriodBalanceStatsWithConvertedBalances({
    accounts,
    rawBalanceByAccountId: balances,
    periodEnd: new Date("2026-01-31T00:00:00Z"),
    referenceCurrency: "CHF",
    convertBalanceToReference: async ({ value, currency }) =>
      currency === "UNKNOWN"
        ? null
        : moneyMultiply(value, currency === "USD" ? 2 : 1),
  });
}

describe("balance-based reporting", () => {
  it("reconciles totals, allocation trees, and History scopes before netting mixed-sign groups", async () => {
    const accounts = [
      account("bank", AccountType.ASSET),
      account("overdraft", AccountType.ASSET, "USD"),
      account("overpayment", AccountType.LIABILITY),
      account("card-debt", AccountType.LIABILITY),
      account("zero", AccountType.LIABILITY, "UNKNOWN"),
      account("unvalued", AccountType.ASSET, "UNKNOWN"),
      account("equity", AccountType.EQUITY),
    ];
    const stats = await compute(
      accounts,
      new Map([
        ["bank", toMoney(100)],
        ["overdraft", toMoney(-10)],
        ["overpayment", toMoney(5)],
        ["card-debt", toMoney(-40)],
        ["unvalued", toMoney(9)],
        ["equity", toMoney(1000)],
      ]),
    );
    expect(toNumericMoney(stats)).toMatchObject({
      assets: 105,
      liabilities: 60,
      netWorth: 45,
      skippedCount: 1,
    });
    expect(stats.convertedBalanceByAccountId.has("equity")).toBe(false);
    expect(stats.convertedBalanceByAccountId.get("zero")?.toString()).toBe("0");

    const maps = buildBalanceHistoryScopeAmountMaps({
      accounts,
      convertedBalanceByAccountId: stats.convertedBalanceByAccountId,
    });
    for (const [side, amountMap, expectedIds, total] of [
      ["asset", maps.assetAmountByAccountId, ["bank", "overpayment"], 105],
      [
        "liability",
        maps.liabilityAmountByAccountId,
        ["card-debt", "overdraft"],
        60,
      ],
    ] as const) {
      const allocation = buildPeriodEndAllocationBreakdown({
        side,
        groupById,
        items: accounts.map((a) => ({
          accountId: a.id,
          accountName: a.name,
          groupId: a.groupId,
          accountType: a.type,
          convertedBalanceInReferenceCurrency:
            stats.convertedBalanceByAccountId.get(a.id) ?? null,
        })),
      });
      expect(toNumericMoney(allocation.totalAmount)).toBe(total);
      expect(allocation.skippedMissingReferenceBalanceCount).toBe(1);
      expect(allocation.hierarchy[0]?.id).toBe("group:banking");
      expect(allocation.hierarchy[0]?.children[0]?.id).toBe("group:cards");
      expect(
        allocation.hierarchy[0]?.children[0]?.children.map((node) => node.id),
      ).toEqual(expectedIds.map((id) => `account:${id}`));
      const metric = side === "asset" ? "assets" : "liabilities";
      expect(
        toNumericMoney(
          resolveScopedMetricValue({
            metricScopeFilter: { metric, scope: "group:banking" },
            amountByMetric: { [metric]: amountMap },
            allAccountGroups: groups,
          }),
        ),
      ).toBe(total);
      expect(
        buildHistoryScopeOptions({
          amountByAccountId: amountMap,
          allAccountGroups: groups,
        }).map((option) => option.value),
      ).toContain(`account:${expectedIds[0]}`);
    }
  });

  it.each([AccountType.ASSET, AccountType.LIABILITY])(
    "clips scoped contributions to each side as a %s account crosses zero",
    async (type) => {
      const accounts = [account("crossing", type)];
      const values = [];
      for (const value of [25, 0, -10]) {
        const stats = await compute(
          accounts,
          new Map([["crossing", toMoney(value)]]),
        );
        const maps = buildBalanceHistoryScopeAmountMaps({
          accounts,
          convertedBalanceByAccountId: stats.convertedBalanceByAccountId,
        });
        values.push(
          ["assets", "liabilities"].map((metric) =>
            toNumericMoney(
              resolveScopedMetricValue({
                metricScopeFilter: {
                  metric: metric as "assets" | "liabilities",
                  scope: "account:crossing",
                },
                amountByMetric: {
                  assets: maps.assetAmountByAccountId,
                  liabilities: maps.liabilityAmountByAccountId,
                },
                allAccountGroups: groups,
              }),
            ),
          ),
        );
        expect(stats.netWorth.toString()).toBe(String(value));
      }
      expect(values).toEqual([
        [25, 0],
        [0, 0],
        [0, 10],
      ]);
    },
  );

  it("classifies exact balances without losing sub-cent values", async () => {
    const stats = await compute(
      [
        account("tiny-debt", AccountType.ASSET),
        account("tiny-credit", AccountType.LIABILITY),
      ],
      new Map([
        ["tiny-debt", toMoney("-0.004")],
        ["tiny-credit", toMoney("0.006")],
      ]),
    );
    expect(stats.assets.toString()).toBe("0.006");
    expect(stats.liabilities.toString()).toBe("0.004");
    expect(stats.netWorth.toString()).toBe("0.002");
  });

  it("preserves both directions of virtual transfer-clearing balances", async () => {
    const virtual = buildTransferClearingVirtualHierarchy({
      unitBuckets: [10, -20].map((rawBalance, i) => ({
        unitKey: `currency:${i}`,
        unitLabel: String(i),
        unitType: "currency",
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        isNonReferenceUnit: false,
        rawBalance: toMoney(rawBalance),
        bookings: [],
      })),
    });
    const stats = await computeEndOfPeriodBalanceStatsWithConvertedBalances({
      accounts: virtual.virtualAccounts,
      rawBalanceByAccountId: virtual.rawBalanceByVirtualAccountId,
      periodEnd: new Date("2026-01-31T00:00:00Z"),
      referenceCurrency: "CHF",
      convertBalanceToReference: async ({ value }) => value,
    });
    expect(toNumericMoney(stats)).toMatchObject({
      assets: 20,
      liabilities: 10,
      netWorth: 10,
    });
  });
});
