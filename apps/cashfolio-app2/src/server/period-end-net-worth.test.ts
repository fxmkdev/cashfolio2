import { afterEach, describe, expect, it, vi } from "vitest";

const convertBookingValueToReference = vi.hoisted(() => vi.fn());

vi.mock("./period-conversion", () => ({
  convertBookingValueToReference,
}));

import { loadPeriodEndNetWorth } from "./period-end-net-worth.server";
import { type PeriodBaseData } from "./period-base-data-cache";

function createBaseData(input: {
  endOfPeriodRawBalances: Array<{ accountId: string; rawBalance: number }>;
  baseAssetLiabilityAccounts: Array<{
    id: string;
    type: "ASSET" | "LIABILITY";
    unit: "CURRENCY" | "SECURITY" | "CRYPTOCURRENCY";
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
  }>;
  transferClearingUnitBuckets: Array<{
    unitKey: string;
    unitLabel: string;
    unitType: "currency" | "security" | "cryptocurrency";
    unit: "CURRENCY" | "SECURITY" | "CRYPTOCURRENCY";
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
    isNonReferenceUnit: boolean;
    rawBalance: number;
    bookings: [];
  }>;
}): PeriodBaseData {
  return {
    selection: {
      periodValue: "2026-02",
      to: new Date("2026-02-28T00:00:00.000Z"),
    },
    referenceCurrency: "CHF",
    endOfPeriodRawBalances: input.endOfPeriodRawBalances,
    baseAssetLiabilityAccounts: input.baseAssetLiabilityAccounts,
    transferClearingUnitBuckets: input.transferClearingUnitBuckets,
  } as unknown as PeriodBaseData;
}

describe("loadPeriodEndNetWorth", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("includes transfer-clearing virtual balances in end-of-period net worth", async () => {
    convertBookingValueToReference.mockImplementation(
      async ({ value }) => value,
    );

    const baseData = createBaseData({
      endOfPeriodRawBalances: [{ accountId: "asset-cash", rawBalance: 100 }],
      baseAssetLiabilityAccounts: [
        {
          id: "asset-cash",
          type: "ASSET",
          unit: "CURRENCY",
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
      ],
      transferClearingUnitBuckets: [
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
      ],
    });

    const result = await loadPeriodEndNetWorth({
      accountBookId: "book-1",
      baseData,
    });

    expect(result).toMatchObject({
      selectedPeriodValue: "2026-02",
      endOfPeriodNetWorth: 75,
      skippedCount: 0,
    });
  });

  it("counts skipped conversions from transfer-clearing virtual balances", async () => {
    convertBookingValueToReference.mockImplementation(
      async ({ unit, value }) => {
        if (unit === "SECURITY") {
          return null;
        }
        return value;
      },
    );

    const baseData = createBaseData({
      endOfPeriodRawBalances: [{ accountId: "asset-cash", rawBalance: 100 }],
      baseAssetLiabilityAccounts: [
        {
          id: "asset-cash",
          type: "ASSET",
          unit: "CURRENCY",
          currency: "CHF",
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
        },
      ],
      transferClearingUnitBuckets: [
        {
          unitKey: "security:AAPL:USD",
          unitLabel: "AAPL:USD",
          unitType: "security",
          unit: "SECURITY",
          currency: null,
          cryptocurrency: null,
          symbol: "AAPL",
          tradeCurrency: "USD",
          isNonReferenceUnit: true,
          rawBalance: 10,
          bookings: [],
        },
      ],
    });

    const result = await loadPeriodEndNetWorth({
      accountBookId: "book-1",
      baseData,
    });

    expect(result).toMatchObject({
      endOfPeriodNetWorth: 100,
      skippedCount: 1,
    });
  });
});
