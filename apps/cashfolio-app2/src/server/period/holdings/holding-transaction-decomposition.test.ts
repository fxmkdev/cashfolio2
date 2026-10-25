import { describe, expect, it } from "vitest";
import { moneyAdd, moneySum, toMoney } from "../../../shared/money";
import { decomposeHoldingTransaction } from "./holding-transaction-decomposition";
import type { HoldingTransactionBooking } from "./period-overview-holdings-types";

function booking(
  id: string,
  accountId: string,
  value: string | number,
  symbol = "AAPL",
): HoldingTransactionBooking {
  return {
    id,
    accountId,
    value: toMoney(value),
    date: new Date("2026-02-01Z"),
    unit: "SECURITY",
    symbol,
    tradeCurrency: "CHF",
    currency: null,
    cryptocurrency: null,
    accountType: "BALANCE",
    equityAccountSubtype: null,
  };
}
function split(bookings: HoldingTransactionBooking[]) {
  return decomposeHoldingTransaction(
    bookings,
    new Set(
      bookings
        .filter((item) => item.accountType === "BALANCE")
        .map((item) => item.accountId),
    ),
  );
}
function quantities(bookings: HoldingTransactionBooking[]) {
  return Object.fromEntries(
    bookings.map((item) => [item.id, item.value.toString()]),
  );
}

describe("holding transaction decomposition", () => {
  it("matches a partial transfer independently of fees and explicit G/L without mutating input", () => {
    const bookings = [
      booking("out", "a", -10),
      booking("in", "b", 9),
      {
        ...booking("fee", "expense", 1),
        accountType: "EQUITY" as const,
        equityAccountSubtype: "EXPENSE" as const,
      },
      {
        ...booking("gl", "gain", 5),
        accountType: "EQUITY" as const,
        equityAccountSubtype: "GAIN_LOSS" as const,
      },
    ];
    const before = quantities(bookings);
    const result = split(bookings);
    expect(quantities(result.transfers.flat())).toEqual({ out: "-9", in: "9" });
    expect(quantities(result.residualBookings)).toEqual({
      out: "-1",
      fee: "1",
    });
    expect(quantities(bookings)).toEqual(before);
  });

  it("reroutes an earlier match to maximise cross-account matching", () => {
    // Greedily pairing A -> C prevents B -> C; rerouting A -> B matches all units.
    const bookings = [
      booking("1", "a", -1),
      booking("2", "b", -1),
      booking("3", "c", 1),
      booking("4", "b", 1),
    ];
    const result = split(bookings);
    expect(result.residualBookings).toEqual([]);
    expect(quantities(result.transfers.flat())).toEqual(quantities(bookings));
    expect(split([...bookings].reverse())).toEqual(result);
  });

  it("does not treat same-account opposite bookings as a transfer", () => {
    const bookings = [booking("buy", "a", 10), booking("sell", "a", -10)];
    expect(split(bookings)).toEqual({
      transfers: [],
      residualBookings: bookings,
    });
  });

  it("keeps holding identities separate and splits residual acquisitions exactly", () => {
    const bookings = [
      booking("out-a", "a", "-0.123456789123"),
      booking("in-a", "b", "0.223456789123"),
      booking("out-b", "c", -3, "MSFT"),
      booking("in-b", "d", 2, "MSFT"),
      booking("other-currency", "e", 1),
    ].map((item) =>
      item.id === "other-currency" ? { ...item, tradeCurrency: "USD" } : item,
    );
    const result = split(bookings);
    expect(result.transfers).toHaveLength(2);
    expect(quantities(result.residualBookings)).toEqual({
      "in-a": "0.1",
      "out-b": "-1",
      "other-currency": "1",
    });
    for (const transfer of result.transfers)
      expect(moneySum(transfer.map((item) => item.value)).isZero()).toBe(true);
    for (const original of bookings) {
      const portions = [
        ...result.transfers.flat(),
        ...result.residualBookings,
      ].filter((item) => item.id === original.id);
      expect(
        moneySum(portions.map((item) => item.value)).eq(original.value),
      ).toBe(true);
    }
  });

  it("ignores missing identities, zero and negligible quantities and untracked accounts", () => {
    const zero = booking("zero", "a", 0);
    const tiny = booking("tiny", "a", "0.0000000001");
    const invalid = { ...booking("invalid", "b", -1), symbol: null };
    const untracked = booking("untracked", "c", 1);
    expect(
      decomposeHoldingTransaction(
        [zero, tiny, invalid, untracked],
        new Set(["a", "b"]),
      ),
    ).toEqual({
      transfers: [],
      residualBookings: [zero, tiny, invalid, untracked],
    });
  });

  it("matches multiple sources and destinations in booking-date then ID order", () => {
    const older = {
      ...booking("z-old", "a", -2),
      date: new Date("2026-01-01Z"),
    };
    const bookings = [
      booking("later", "b", -5),
      booking("receive1", "c", 3),
      booking("receive2", "d", 1),
      older,
    ];
    const result = split(bookings);
    expect(quantities(result.transfers.flat())).toEqual({
      "z-old": "-2",
      later: "-2",
      receive1: "3",
      receive2: "1",
    });
    expect(result.residualBookings[0]!.value.eq(moneyAdd(-5, 2))).toBe(true);
  });
});
