import { describe, expect, test } from "vitest";
import { Unit } from "../.prisma-client/enums";
import { deriveActivityRows } from "./activity-derivation";

function utcDate(
  year: number,
  monthIndex: number,
  day: number,
  hour: number = 0,
): Date {
  return new Date(Date.UTC(year, monthIndex, day, hour, 0, 0, 0));
}

function createBooking(args: {
  id: string;
  date: Date;
  value: number;
  valueInReferenceCurrency?: number | null;
  description?: string | null;
  transactionDescription?: string | null;
  account?: { id: string; name: string };
}) {
  return {
    id: args.id,
    date: args.date,
    description: args.description ?? null,
    value: args.value,
    valueInReferenceCurrency:
      args.valueInReferenceCurrency === undefined
        ? args.value
        : args.valueInReferenceCurrency,
    unit: Unit.CURRENCY as Unit | null,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    transactionId: `transaction-${args.id}`,
    transactionDescription: args.transactionDescription ?? null,
    account: args.account ?? { id: "cash", name: "Cash" },
    isOpeningBalancesTransaction: false,
  };
}

describe("deriveActivityRows", () => {
  test("keeps booking order and maps account metadata", () => {
    const result = deriveActivityRows({
      bookings: [
        createBooking({
          id: "newer",
          date: utcDate(2026, 0, 11),
          value: 30,
          account: { id: "bank", name: "Bank" },
        }),
        createBooking({
          id: "older",
          date: utcDate(2026, 0, 10),
          value: -50,
          account: { id: "cash", name: "Cash" },
        }),
      ],
    });

    expect(result.rows).toEqual([
      expect.objectContaining({
        id: "newer",
        date: "11.01.2026",
        account: { id: "bank", name: "Bank" },
      }),
      expect.objectContaining({
        id: "older",
        date: "10.01.2026",
        account: { id: "cash", name: "Cash" },
      }),
    ]);
  });

  test("uses raw booking signs for debit and credit columns", () => {
    const result = deriveActivityRows({
      bookings: [
        createBooking({ id: "debit", date: utcDate(2026, 0, 10), value: 100 }),
        createBooking({
          id: "credit",
          date: utcDate(2026, 0, 10),
          value: -40,
        }),
      ],
    });

    expect(result.rows).toEqual([
      expect.objectContaining({ debit: 100, credit: null }),
      expect.objectContaining({ debit: null, credit: 40 }),
    ]);
  });

  test("splits converted reference values and leaves unavailable conversions empty", () => {
    const result = deriveActivityRows({
      bookings: [
        createBooking({
          id: "converted-debit",
          date: utcDate(2026, 0, 10),
          value: 100,
          valueInReferenceCurrency: 120,
        }),
        createBooking({
          id: "converted-credit",
          date: utcDate(2026, 0, 10),
          value: -40,
          valueInReferenceCurrency: -50,
        }),
        createBooking({
          id: "missing",
          date: utcDate(2026, 0, 10),
          value: 10,
          valueInReferenceCurrency: null,
        }),
      ],
    });

    expect(result.rows).toEqual([
      expect.objectContaining({ referenceDebit: 120, referenceCredit: null }),
      expect.objectContaining({ referenceDebit: null, referenceCredit: 50 }),
      expect.objectContaining({ referenceDebit: null, referenceCredit: null }),
    ]);
  });

  test("falls back from booking description to transaction description", () => {
    const result = deriveActivityRows({
      bookings: [
        createBooking({
          id: "booking-description",
          date: utcDate(2026, 0, 10),
          value: 100,
          description: "Booking text",
          transactionDescription: "Transaction text",
        }),
        createBooking({
          id: "transaction-description",
          date: utcDate(2026, 0, 10),
          value: 100,
          transactionDescription: "Transaction text",
        }),
      ],
    });

    expect(result.rows).toEqual([
      expect.objectContaining({ description: "Booking text" }),
      expect.objectContaining({ description: "Transaction text" }),
    ]);
  });
});
