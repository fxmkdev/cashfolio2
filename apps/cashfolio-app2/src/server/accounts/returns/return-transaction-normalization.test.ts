import { expect, it, vi } from "vitest";
import { toMoney } from "../../../shared/money";
import type { HoldingBookingConverter } from "../../holdings/types";
import { account, cash } from "./return-test-support";
import { prepareReturnTransactions } from "./return-transactions.server";

const args = {
  referenceCurrency: "CHF",
  startDate: "2026-01-01",
  asOfDate: "2026-11-07",
};
it("retains recorded-adjustment bypass, conversion order, movement identities and settlement bridges", async () => {
  const convert = vi.fn(
    async (booking: Parameters<HoldingBookingConverter>[0]) => booking.value,
  );
  const prepared = await prepareReturnTransactions({
    ...args,
    accounts: [
      account("a", { currency: "CHF" }),
      account("b", { currency: "CHF" }),
    ],
    transactions: [
      {
        bookings: [
          cash("gain-value", "2026-03-05", "10", { accountId: "a" }),
          cash("gain", "2026-03-01", "-10", {
            accountId: "gain",
            accountType: "EQUITY",
            equityAccountSubtype: "GAIN_LOSS",
          }),
        ],
      },
      {
        bookings: [
          cash("out", "2026-04-01", "-5", { accountId: "a" }),
          cash("in", "2026-04-03", "5", { accountId: "b" }),
        ],
      },
      {
        bookings: [
          cash("fee-value", "2026-05-01", "-2", { accountId: "a" }),
          cash("fee", "2026-05-01", "2", {
            accountId: "fee",
            accountType: "EQUITY",
            equityAccountSubtype: "EXPENSE",
          }),
        ],
      },
    ],
    convert,
  });
  expect(
    convert.mock.calls.map(([b]) => [
      b.id,
      b.date.toISOString().slice(0, 10),
      b.value.toString(),
    ]),
  ).toEqual([
    ["gain-value", "2026-03-05", "10"],
    ["gain", "2026-03-05", "10"],
    ["out", "2026-04-01", "-5"],
    ["in", "2026-04-03", "5"],
    ["fee-value", "2026-05-01", "-2"],
  ]);
  expect(
    prepared.movements.map((m) => [m.id, m.peerId, m.amount.toString()]),
  ).toEqual([
    ["gain-value", undefined, "0"],
    ["out:in", "b", "-5"],
    ["in:out", "a", "5"],
    ["fee-value", undefined, "-2"],
  ]);
  expect(
    prepared.bridges.map((b) => [
      b.fromId,
      b.toId,
      b.fromDate,
      b.toDate,
      b.quantity.toString(),
    ]),
  ).toEqual([
    ["a", "a", "2026-03-01", "2026-03-05", "10"],
    ["a", "b", "2026-04-01", "2026-04-03", "5"],
  ]);
  expect([...prepared.recordedAccountIds]).toEqual(["a"]);
  expect(prepared.failures.size).toBe(0);
});
it("preserves diagnostic ordering when recorded adjustment conversions are unavailable", async () => {
  const prepared = await prepareReturnTransactions({
    ...args,
    accounts: [account("a", { currency: "CHF" })],
    transactions: [
      {
        bookings: [
          cash("value", "2026-03-01", "10", { accountId: "a" }),
          cash("gain", "2026-03-01", "-10", {
            accountId: "gain",
            accountType: "EQUITY",
            equityAccountSubtype: "GAIN_LOSS",
          }),
        ],
      },
    ],
    convert: async () => null,
  });
  expect(prepared.failures.get("a")).toEqual([
    "A capital movement could not be valued.",
    "A recorded G/L adjustment could not be valued.",
  ]);
  expect(prepared.movements).toEqual([]);
  expect(prepared.bridges).toHaveLength(1);
});
it("retains execution pairing order and the unpaired fee movement", async () => {
  const stock = {
    unit: "SECURITY" as const,
    currency: null,
    symbol: "TEST",
    tradeCurrency: "CHF",
  };
  const prepared = await prepareReturnTransactions({
    ...args,
    accounts: [account("cash", { currency: "CHF" }), account("stock", stock)],
    transactions: [
      {
        bookings: [
          cash("payment", "2026-02-01", "-105"),
          cash("shares", "2026-02-01", "10", { ...stock, accountId: "stock" }),
          cash("fee", "2026-02-01", "5", {
            accountId: "fee",
            accountType: "EQUITY",
            equityAccountSubtype: "EXPENSE",
          }),
        ],
      },
    ],
    convert: async (booking) =>
      booking.value.mul(booking.unit === "SECURITY" ? 10 : 1),
  });
  expect(
    prepared.movements.map((m) => [m.id, m.peerId, m.amount.toString()]),
  ).toEqual([
    ["payment:shares", "stock", "-100"],
    ["shares:payment", "cash", "100"],
    ["payment", undefined, "-5"],
  ]);
  expect(prepared.bridges).toEqual([
    expect.objectContaining({
      fromId: "cash",
      toId: "stock",
      currency: "CHF",
      quantity: toMoney(100),
    }),
  ]);
});
