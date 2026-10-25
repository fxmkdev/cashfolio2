import { toMoney } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
import { toMoneyNumber, type Money } from "../../../shared/money";
import { describe, expect, it, vi } from "vitest";
import { Unit } from "../../../.prisma-client/enums";

vi.mock("../../../prisma.server", () => {
  throw new Error("Residual calculations must not import Prisma.");
});
import type { PeriodBaseExecutionResidualTransaction } from "../base-data/period-base-data-types";
import { computeExecutionResidualRealization } from "./period-execution-residuals";

describe("computeExecutionResidualRealization", () => {
  it("retains unrelated execution residuals after removing a fully matched holding transfer", async () => {
    const base = residualTransaction().bookings[0]!;
    const bookings = [
      {
        ...base,
        id: "out",
        accountId: "source",
        unit: Unit.SECURITY,
        currency: null,
        symbol: "AAPL",
        tradeCurrency: "CHF",
        value: toMoney(-2),
      },
      {
        ...base,
        id: "in",
        accountId: "destination",
        unit: Unit.SECURITY,
        currency: null,
        symbol: "AAPL",
        tradeCurrency: "CHF",
        value: toMoney(2),
      },
      { ...base, id: "cash", value: toMoney(-90) },
      {
        ...base,
        id: "fee",
        accountId: "expense",
        currency: "USD",
        value: toMoney(100),
      },
    ];
    const convert = vi.fn(
      async (booking: { value: Money; currency: string | null }) =>
        booking.currency === "USD" ? booking.value.times("0.8") : booking.value,
    );
    const onContribution = vi.fn();
    const result = await computeExecutionResidualRealization({
      transactions: [{ id: "mixed", bookings }],
      periodStart: new Date("2026-02-01Z"),
      periodEndExclusive: new Date("2026-03-01Z"),
      referenceCurrency: "CHF",
      trackedHoldingAccountIdSet: new Set(["source", "destination"]),
      assetLiabilityAccountIdSet: new Set(["source", "destination", "cash"]),
      convertBookingToReference: convert,
      onContribution,
    });
    expect(toNumericMoney(result.realizedGainLoss)).toBe(-10);
    expect(convert).toHaveBeenCalledTimes(2);
    expect(onContribution).toHaveBeenCalledOnce();
    expect(onContribution.mock.calls[0]![0].accountId).toBe("expense");
    expect(onContribution.mock.calls[0]![0].originatingAccountIds).toEqual([
      "cash",
    ]);
  });

  it("converts cross-period completion candidates without realizing zero residuals", async () => {
    const transactions = [
      {
        id: "tx-cross-period",
        bookings: [
          {
            id: "booking-cash-chf",
            accountId: "asset-cash",
            date: new Date("2025-12-31T23:00:00.000Z"),
            value: toMoney(-100),
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            account: { name: "Cash" },
          },
          {
            id: "booking-expense-usd",
            accountId: "expense-usd",
            date: new Date("2026-01-15T00:00:00.000Z"),
            value: toMoney(100),
            unit: Unit.CURRENCY,
            currency: "USD",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            account: { name: "Travel USD" },
          },
        ],
      },
    ];

    const contributions: Array<{
      accountId: string;
      realizedGainLoss: number;
    }> = [];
    const convertBookingToReference = vi.fn(
      async ({ value }: { value: Money }) => value,
    );

    const result = await computeExecutionResidualRealization({
      transactions,
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-02-01T00:00:00.000Z"),
      referenceCurrency: "CHF",
      trackedHoldingAccountIdSet: new Set<string>(),
      convertBookingToReference,
      onContribution: (contribution) => {
        contributions.push({
          accountId: contribution.accountId,
          realizedGainLoss: toMoneyNumber(contribution.realizedGainLoss),
        });
      },
    });

    expect(toNumericMoney(result)).toMatchObject({
      realizedGainLoss: 0,
      convertedCount: 2,
      skippedCount: 0,
    });
    expect(convertBookingToReference).toHaveBeenCalledTimes(2);
    expect(toNumericMoney(contributions)).toEqual([]);
  });

  it("realizes cross-period residuals in the completion period", async () => {
    const transactions = [
      {
        id: "tx-cross-period-completion",
        bookings: [
          {
            id: "booking-expense-usd",
            accountId: "expense-usd",
            date: new Date("2026-01-31T00:00:00.000Z"),
            value: toMoney(100),
            unit: Unit.CURRENCY,
            currency: "USD",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            account: { name: "Travel USD" },
          },
          {
            id: "booking-cash-chf",
            accountId: "asset-cash",
            date: new Date("2026-02-01T00:00:00.000Z"),
            value: toMoney(-90),
            unit: Unit.CURRENCY,
            currency: "CHF",
            cryptocurrency: null,
            symbol: null,
            tradeCurrency: null,
            account: { name: "Cash" },
          },
        ],
      },
    ];

    const contributions: Array<{
      accountId: string;
      realizedGainLoss: number;
    }> = [];

    const result = await computeExecutionResidualRealization({
      transactions,
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
      referenceCurrency: "CHF",
      trackedHoldingAccountIdSet: new Set<string>(),
      convertBookingToReference: async ({ currency, value, date }) => {
        if (
          currency === "USD" &&
          toMoney(value).equals(100) &&
          date.toISOString() === "2026-01-31T00:00:00.000Z"
        ) {
          return toMoney(80);
        }
        if (
          currency === "CHF" &&
          toMoney(value).equals(-90) &&
          date.toISOString() === "2026-02-01T00:00:00.000Z"
        ) {
          return toMoney(-90);
        }
        return null;
      },
      onContribution: (contribution) => {
        contributions.push({
          accountId: contribution.accountId,
          realizedGainLoss: toMoneyNumber(contribution.realizedGainLoss),
        });
      },
    });

    expect(toNumericMoney(result)).toMatchObject({
      realizedGainLoss: -10,
      convertedCount: 2,
      skippedCount: 0,
    });
    expect(toNumericMoney(contributions)).toEqual([
      {
        accountId: "expense-usd",
        realizedGainLoss: -10,
      },
    ]);
  });
});

function residualTransaction(): PeriodBaseExecutionResidualTransaction {
  return {
    id: "residual",
    bookings: [
      {
        id: "chf",
        accountId: "cash",
        date: new Date("2026-02-01"),
        value: toMoney(-90),
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        account: { name: "Cash" },
      },
      {
        id: "usd",
        accountId: "expense-usd",
        date: new Date("2026-01-31"),
        value: toMoney(20),
        unit: Unit.CURRENCY,
        currency: "USD",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        account: { name: "USD Expense" },
      },
      {
        id: "eur",
        accountId: "expense-eur",
        date: new Date("2026-02-01"),
        value: toMoney(60),
        unit: Unit.CURRENCY,
        currency: "EUR",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        account: { name: "EUR Expense" },
      },
    ],
  };
}
const residualArgs = {
  periodStart: new Date("2026-02-01"),
  periodEndExclusive: new Date("2026-03-01"),
  referenceCurrency: "CHF",
  trackedHoldingAccountIdSet: new Set<string>(),
};
it("attributes the residual across non-reference legs by Decimal value weight", async () => {
  const onContribution = vi.fn();
  const result = await computeExecutionResidualRealization({
    ...residualArgs,
    transactions: [residualTransaction()],
    convertBookingToReference: async ({ value }) => value,
    onContribution,
  });
  expect(result.realizedGainLoss.toString()).toBe("-10");
  expect(
    onContribution.mock.calls.map(([c]) => [
      c.accountId,
      c.realizedGainLoss.toString(),
    ]),
  ).toEqual([
    ["expense-usd", "-2.5"],
    ["expense-eur", "-7.5"],
  ]);
});
it("skips realization and attribution when any conversion is missing", async () => {
  const onContribution = vi.fn();
  const result = await computeExecutionResidualRealization({
    ...residualArgs,
    transactions: [residualTransaction()],
    convertBookingToReference: async ({ currency, value }) =>
      currency === "EUR" ? null : value,
    onContribution,
  });
  expect(toNumericMoney(result)).toEqual({
    realizedGainLoss: 0,
    convertedCount: 2,
    skippedCount: 1,
  });
  expect(onContribution).not.toHaveBeenCalled();
});
it("excludes in-period tracked holdings but accepts tracked legs before the period", async () => {
  const convertBookingToReference = vi.fn(
    async ({ value }: { value: Money }) => value,
  );
  const onContribution = vi.fn();
  const result = await computeExecutionResidualRealization({
    ...residualArgs,
    transactions: [residualTransaction()],
    trackedHoldingAccountIdSet: new Set(["expense-eur"]),
    convertBookingToReference,
    onContribution,
  });
  expect(toNumericMoney(result)).toEqual({
    realizedGainLoss: 0,
    convertedCount: 0,
    skippedCount: 0,
  });
  expect(convertBookingToReference).not.toHaveBeenCalled();
  const completed = await computeExecutionResidualRealization({
    ...residualArgs,
    transactions: [residualTransaction()],
    trackedHoldingAccountIdSet: new Set(["expense-usd"]),
    convertBookingToReference,
    onContribution,
  });
  expect(completed.realizedGainLoss.toString()).toBe("-10");
});
it("ignores empty and same-unit transactions without valuation lookups", async () => {
  const singleUnit = residualTransaction();
  singleUnit.bookings = singleUnit.bookings.map((b) => ({
    ...b,
    currency: "CHF",
  }));
  const convertBookingToReference = vi.fn();
  const result = await computeExecutionResidualRealization({
    ...residualArgs,
    transactions: [{ id: "empty", bookings: [] }, singleUnit],
    convertBookingToReference,
    onContribution: () => undefined,
  });
  expect(result.realizedGainLoss.toString()).toBe("0");
  expect(convertBookingToReference).not.toHaveBeenCalled();
});
