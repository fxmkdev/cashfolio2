import { beforeEach, describe, expect, test, vi } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";

const prisma = vi.hoisted(() => ({
  account: {
    findMany: vi.fn(),
  },
  accountGroup: {
    findMany: vi.fn(),
  },
  booking: {
    groupBy: vi.fn(),
  },
}));

const loadTransferClearingUnitBuckets = vi.hoisted(() => vi.fn());
const convertBookingValueToReference = vi.hoisted(() => vi.fn());

vi.mock("../../prisma.server", () => ({
  prisma,
}));

vi.mock("./period-transfer-clearing", async () => {
  const actual = await vi.importActual<
    typeof import("./period-transfer-clearing")
  >("./period-transfer-clearing");
  return {
    ...actual,
    loadTransferClearingUnitBuckets,
  };
});

vi.mock("./period-conversion", () => ({
  convertBookingValueToReference,
}));

import { loadHistoryOpeningBalancePoint } from "./period-history-opening-balance.server";

describe("loadHistoryOpeningBalancePoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("normalizes start-date boundaries and computes balances including transfer-clearing virtual accounts", async () => {
    prisma.account.findMany.mockResolvedValue([
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
    ]);
    prisma.accountGroup.findMany.mockResolvedValue([]);
    prisma.booking.groupBy.mockResolvedValue([
      {
        accountId: "asset-1",
        _sum: { value: 100 },
      },
      {
        accountId: "liability-1",
        _sum: { value: -40 },
      },
    ]);

    loadTransferClearingUnitBuckets.mockResolvedValue([
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
        rawBalance: -20,
        bookings: [],
      },
    ]);

    convertBookingValueToReference.mockImplementation(
      async ({ value }: { value: number }) => value,
    );

    const result = await loadHistoryOpeningBalancePoint({
      accountBookId: "book-1",
      accountBookStartDate: new Date("2026-01-05T15:42:00.000Z"),
      referenceCurrency: "CHF",
    });

    expect(prisma.booking.groupBy).toHaveBeenCalledWith({
      by: ["accountId"],
      where: {
        accountBookId: "book-1",
        accountId: { in: ["asset-1", "liability-1"] },
        date: {
          lt: new Date("2026-01-05T00:00:00.000Z"),
        },
      },
      _sum: {
        value: true,
      },
    });

    expect(loadTransferClearingUnitBuckets).toHaveBeenCalledWith({
      accountBookId: "book-1",
      periodEndExclusive: new Date("2026-01-05T00:00:00.000Z"),
      referenceCurrency: "CHF",
    });

    expect(result).toEqual({
      date: "2026-01-04T00:00:00.000Z",
      label: "Opening Balance",
      assets: 120,
      liabilities: 40,
      netWorth: 80,
    });
    expect("scopedMetricValue" in result).toBe(false);
  });

  test("resolves scoped asset opening balance from account groups", async () => {
    prisma.account.findMany.mockResolvedValue([
      {
        id: "asset-1",
        name: "Cash",
        groupId: "group-assets",
        type: AccountType.ASSET,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      },
      {
        id: "asset-2",
        name: "Brokerage",
        groupId: "group-other",
        type: AccountType.ASSET,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      },
    ]);
    prisma.accountGroup.findMany.mockResolvedValue([
      { id: "group-assets", name: "Assets", parentGroupId: null },
      { id: "group-other", name: "Other", parentGroupId: null },
    ]);
    prisma.booking.groupBy.mockResolvedValue([
      { accountId: "asset-1", _sum: { value: 75 } },
      { accountId: "asset-2", _sum: { value: 25 } },
    ]);
    loadTransferClearingUnitBuckets.mockResolvedValue([]);
    convertBookingValueToReference.mockImplementation(
      async ({ value }: { value: number }) => value,
    );

    const result = await loadHistoryOpeningBalancePoint({
      accountBookId: "book-1",
      accountBookStartDate: new Date("2026-01-05T15:42:00.000Z"),
      referenceCurrency: "CHF",
      metricScopeFilter: {
        metric: "assets",
        scope: "group:group-assets",
      },
    });

    expect(result).toEqual({
      date: "2026-01-04T00:00:00.000Z",
      label: "Opening Balance",
      assets: 100,
      liabilities: 0,
      netWorth: 100,
      scopedMetricValue: 75,
    });
  });
});
