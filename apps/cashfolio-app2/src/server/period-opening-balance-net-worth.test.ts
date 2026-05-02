import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const convertBookingValueToReference = vi.hoisted(() => vi.fn());
const loadTransferClearingUnitBuckets = vi.hoisted(() => vi.fn());

const prisma = vi.hoisted(() => ({
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
  account: {
    findMany: vi.fn(),
  },
  booking: {
    groupBy: vi.fn(),
  },
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

vi.mock("./period-conversion", () => ({
  convertBookingValueToReference,
}));
vi.mock("./period-transfer-clearing-buckets", () => ({
  loadTransferClearingUnitBuckets,
}));
vi.mock("../.prisma-client/enums", () => ({
  AccountType: {
    ASSET: "ASSET",
    LIABILITY: "LIABILITY",
  },
  Unit: {
    CURRENCY: "CURRENCY",
  },
}));

import { loadOpeningBalanceNetWorthForPeriod } from "./period-opening-balance-net-worth.server";

describe("loadOpeningBalanceNetWorthForPeriod", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));

    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "chf",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.account.findMany.mockResolvedValue([
      {
        id: "asset-cash",
        type: "ASSET",
        unit: "CURRENCY",
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
      },
    ]);
    prisma.booking.groupBy.mockResolvedValue([
      {
        accountId: "asset-cash",
        _sum: { value: 100 },
      },
    ]);
    loadTransferClearingUnitBuckets.mockResolvedValue([]);
    convertBookingValueToReference.mockImplementation(
      async ({ value }) => value,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("uses strict date < period start for opening-balance aggregation", async () => {
    const result = await loadOpeningBalanceNetWorthForPeriod({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(prisma.booking.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: {
            lt: new Date("2026-02-01T00:00:00.000Z"),
          },
        }),
      }),
    );

    expect(convertBookingValueToReference).toHaveBeenCalledWith(
      expect.objectContaining({
        date: new Date("2026-01-31T00:00:00.000Z"),
        referenceCurrency: "CHF",
      }),
    );
    expect(loadTransferClearingUnitBuckets).toHaveBeenCalledWith({
      accountBookId: "book-1",
      periodEndExclusive: new Date("2026-02-01T00:00:00.000Z"),
      referenceCurrency: "CHF",
    });

    expect(result).toMatchObject({
      openingBalanceNetWorth: 100,
      skippedCount: 0,
      periodStart: "2026-02-01T00:00:00.000Z",
    });
  });

  it("includes transfer-clearing virtual balances in opening baseline net worth", async () => {
    loadTransferClearingUnitBuckets.mockResolvedValue([
      {
        unitKey: "currency:CHF",
        unitLabel: "CHF",
        unitType: "currency",
        unit: "CURRENCY",
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        isNonReferenceUnit: false,
        rawBalance: 25,
        bookings: [],
      },
    ]);

    const result = await loadOpeningBalanceNetWorthForPeriod({
      accountBookId: "book-1",
      period: "2026-02",
    });

    expect(result.openingBalanceNetWorth).toBe(75);
    expect(result.skippedCount).toBe(0);
  });
});
