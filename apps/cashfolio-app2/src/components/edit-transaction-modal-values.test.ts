import { describe, expect, test } from "vitest";
import { Unit } from "@/.prisma-client/enums";
import {
  createCopyTransactionInitialValues,
  createTransactionFormInitialValues,
  toTransactionSubmitBookings,
} from "./edit-transaction-modal-values";

describe("createTransactionFormInitialValues", () => {
  test("preserves fractional COP amounts when opening and submitting unchanged", () => {
    const form = createTransactionFormInitialValues({
      initialValues: {
        description: "Transfer",
        bookings: [
          {
            date: "2026-05-18T00:00:00.000Z",
            account: "cash",
            unit: Unit.CURRENCY,
            currency: "COP",
            debit: 1234.5678,
          },
          {
            date: "2026-05-18T00:00:00.000Z",
            account: "bank",
            unit: Unit.CURRENCY,
            currency: "COP",
            credit: 1234.5678,
          },
        ],
      },
    });

    expect(form.bookings[0]?.debit).toBe(1234.5678);
    expect(form.bookings[1]?.credit).toBe(1234.5678);
    expect(
      toTransactionSubmitBookings(form.bookings).map((booking) => ({
        currency: booking.currency,
        value: booking.value,
      })),
    ).toEqual([
      { currency: "COP", value: 1234.5678 },
      { currency: "COP", value: -1234.5678 },
    ]);
  });

  test("supports split editing without a current account", () => {
    const result = createTransactionFormInitialValues({});

    expect(result.bookings).toHaveLength(2);
    expect(result.bookings[0]?.account).toBeUndefined();
    expect(result.bookings[1]?.account).toBeUndefined();
  });

  test("does not inject a current account when editing existing bookings", () => {
    const result = createTransactionFormInitialValues({
      initialValues: {
        description: "Transfer",
        bookings: [
          { account: "cash", description: "Cash leg" },
          { account: "bank", description: "Bank leg" },
        ],
      },
    });

    expect(result.bookings.map((booking) => booking.account)).toEqual([
      "cash",
      "bank",
    ]);
  });

  test("keeps the split date empty when copied bookings have no dates", () => {
    const result = createTransactionFormInitialValues({
      initialValues: {
        description: "Copied transfer",
        bookings: [
          { account: "cash", description: "Cash leg" },
          { account: "bank", description: "Bank leg" },
        ],
      },
    });

    expect(result.date).toBeUndefined();
  });

  test("uses the earliest booking UTC day as a DateInput calendar day", () => {
    const result = createTransactionFormInitialValues({
      initialValues: {
        description: "Transfer",
        bookings: [
          { date: "2026-05-18T00:00:00.000Z", account: "cash" },
          { date: "2026-05-17T00:00:00.000Z", account: "bank" },
        ],
      },
    });

    expect(result.date?.getFullYear()).toBe(2026);
    expect(result.date?.getMonth()).toBe(4);
    expect(result.date?.getDate()).toBe(17);
  });
});

describe("createCopyTransactionInitialValues", () => {
  test("preserves copied booking details, dates, and ordering", () => {
    const result = createCopyTransactionInitialValues({
      description: "Copy me",
      bookings: [
        {
          date: "2026-01-10T00:00:00.000Z",
          account: "cash",
          description: "Cash leg",
          unit: Unit.CURRENCY,
          currency: "CHF",
          debit: 12,
        },
        {
          date: "2026-01-11T00:00:00.000Z",
          account: "expense",
          description: "Expense leg",
          unit: Unit.SECURITY,
          symbol: "VT",
          tradeCurrency: "USD",
          credit: 12,
        },
      ],
    });

    expect(result).toEqual({
      description: "Copy me",
      bookings: [
        {
          date: "2026-01-10T00:00:00.000Z",
          account: "cash",
          description: "Cash leg",
          unit: Unit.CURRENCY,
          currency: "CHF",
          debit: 12,
        },
        {
          date: "2026-01-11T00:00:00.000Z",
          account: "expense",
          description: "Expense leg",
          unit: Unit.SECURITY,
          symbol: "VT",
          tradeCurrency: "USD",
          credit: 12,
        },
      ],
    });
  });
});

describe("toTransactionSubmitBookings", () => {
  test("serializes DateInput dates as canonical UTC days", () => {
    const result = toTransactionSubmitBookings([
      {
        key: "booking-1",
        date: new Date(2026, 4, 18),
        account: "cash",
        description: "",
        unit: Unit.CURRENCY,
        currency: "CHF",
        debit: 12,
      },
    ]);

    expect(result[0]?.date).toBe("2026-05-18T00:00:00.000Z");
  });
});
