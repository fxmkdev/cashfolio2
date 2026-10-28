import { describe, expect, it, vi } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";
import { toMoney, moneyMultiply, type Money } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import { computeEndOfPeriodBalanceStatsWithConvertedBalances } from "./period-balance-stats";
import { buildPeriodEndAllocationBreakdown } from "./breakdown/period-allocation-breakdown";
import {
  buildNetWorthHistoryScopeAmountMap,
  buildNetWorthHistoryScopeOptions,
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
      account("bank", AccountType.BALANCE),
      account("overdraft", AccountType.BALANCE, "USD"),
      account("overpayment", AccountType.BALANCE),
      account("card-debt", AccountType.BALANCE),
      account("zero", AccountType.BALANCE, "UNKNOWN"),
      account("unvalued", AccountType.BALANCE, "UNKNOWN"),
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

    const amountMap = buildNetWorthHistoryScopeAmountMap({
      accounts,
      convertedBalanceByAccountId: stats.convertedBalanceByAccountId,
    });
    expect(
      toNumericMoney(
        resolveScopedMetricValue({
          metricScopeFilter: { metric: "netWorth", scope: "group:banking" },
          amountByMetric: { netWorth: amountMap },
          allAccountGroups: groups,
        }),
      ),
    ).toBe(45);
    const scopes = buildNetWorthHistoryScopeOptions({
      accounts: accounts.filter((a) => a.type === AccountType.BALANCE),
      groups,
    });
    expect(scopes.map((option) => option.value)).toContain("account:zero");
    for (const [side, expectedIds, total] of [
      ["asset", ["bank", "overpayment"], 105],
      ["liability", ["card-debt", "overdraft"], 60],
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
    }
  });

  it("preserves signed scoped balances as accounts cross zero", async () => {
    const accounts = [account("crossing", AccountType.BALANCE)];
    const values = [];
    for (const value of [25, 0, -10]) {
      const stats = await compute(
        accounts,
        new Map([["crossing", toMoney(value)]]),
      );
      const amounts = buildNetWorthHistoryScopeAmountMap({
        accounts,
        convertedBalanceByAccountId: stats.convertedBalanceByAccountId,
      });
      values.push(
        toNumericMoney(
          resolveScopedMetricValue({
            metricScopeFilter: {
              metric: "netWorth",
              scope: "account:crossing",
            },
            amountByMetric: { netWorth: amounts },
            allAccountGroups: groups,
          }),
        ),
      );
    }
    expect(values).toEqual([25, 0, -10]);
  });

  it("classifies exact balances without losing sub-cent values", async () => {
    const stats = await compute(
      [
        account("tiny-debt", AccountType.BALANCE),
        account("tiny-credit", AccountType.BALANCE),
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
