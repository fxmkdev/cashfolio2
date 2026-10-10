import { describe, expect, it, vi } from "vitest";
import { AccountType, Unit } from "../../.prisma-client/enums";
import {
  computePeriodCashFlow,
  type PeriodCashFlowTransaction,
} from "./period-cash-flow";

function cashBooking(
  value: number,
  overrides: Partial<PeriodCashFlowTransaction["bookings"][number]> = {},
): PeriodCashFlowTransaction["bookings"][number] {
  return {
    value,
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    date: new Date("2026-01-10T00:00:00.000Z"),
    account: {
      id: "cash-a",
      name: "Cash A",
      groupId: "cash-group",
      type: AccountType.ASSET,
      isCashAccount: true,
    },
    ...overrides,
  };
}

describe("computePeriodCashFlow", () => {
  it("adds income cash receipts and subtracts cash expenses", async () => {
    const result = await computePeriodCashFlow({
      transactions: [
        {
          id: "tx-salary",
          bookings: [
            cashBooking(100),
            cashBooking(-100, {
              account: {
                id: "income-a",
                name: "Income A",
                groupId: null,
                type: AccountType.EQUITY,
                isCashAccount: false,
              },
            }),
          ],
        },
        {
          id: "tx-rent",
          bookings: [
            cashBooking(-40),
            cashBooking(40, {
              account: {
                id: "expense-a",
                name: "Expense A",
                groupId: null,
                type: AccountType.EQUITY,
                isCashAccount: false,
              },
            }),
          ],
        },
      ],
      convertBookingToReference: async (booking) => booking.value,
    });

    expect(result.cashFlow).toBe(60);
    expect(result.skippedCount).toBe(0);
    expect(Array.from(result.cashFlowAmountByAccountId.values())).toEqual([
      {
        accountId: "cash-a",
        accountName: "Cash A",
        groupId: "cash-group",
        amount: 60,
      },
    ]);
  });

  it("ignores pure cash-to-cash transfers", async () => {
    const convertBookingToReference = vi.fn(async (booking) => booking.value);

    const result = await computePeriodCashFlow({
      transactions: [
        {
          id: "tx-transfer",
          bookings: [cashBooking(-100), cashBooking(95, { currency: "EUR" })],
        },
      ],
      convertBookingToReference,
    });

    expect(result.cashFlow).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(result.cashFlowAmountByAccountId.size).toBe(0);
    expect(convertBookingToReference).not.toHaveBeenCalled();
  });

  it("ignores non-cash currency assets and reports skipped conversions", async () => {
    const result = await computePeriodCashFlow({
      transactions: [
        {
          id: "tx-investment",
          bookings: [
            cashBooking(-100),
            cashBooking(100, {
              account: {
                id: "brokerage-a",
                name: "Brokerage A",
                groupId: null,
                type: AccountType.ASSET,
                isCashAccount: false,
              },
            }),
          ],
        },
        {
          id: "tx-no-rate",
          bookings: [cashBooking(20, { currency: "XXX" })],
        },
      ],
      convertBookingToReference: async (booking) =>
        booking.currency === "XXX" ? null : booking.value,
    });

    expect(result.cashFlow).toBe(-100);
    expect(result.skippedCount).toBe(1);
    expect(result.cashFlowAmountByAccountId.get("cash-a")?.amount).toBe(-100);
  });

  it("sums only cash bookings inside the requested period", async () => {
    const result = await computePeriodCashFlow({
      transactions: [
        {
          id: "tx-cross-period",
          bookings: [
            cashBooking(100, { date: new Date("2026-01-31T00:00:00.000Z") }),
            cashBooking(50, { date: new Date("2026-02-01T00:00:00.000Z") }),
            cashBooking(-150, {
              account: {
                id: "equity-a",
                name: "Equity A",
                groupId: null,
                type: AccountType.EQUITY,
                isCashAccount: false,
              },
            }),
          ],
        },
      ],
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-02-01T00:00:00.000Z"),
      convertBookingToReference: async (booking) => booking.value,
    });

    expect(result.cashFlow).toBe(100);
    expect(result.skippedCount).toBe(0);
    expect(result.cashFlowAmountByAccountId.get("cash-a")?.amount).toBe(100);
  });
});
