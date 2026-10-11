import type { MoneyInput } from "../shared/money";
import { toMoney } from "../shared/money";
import { describe, expect, test } from "vitest";
import { Unit } from "../.prisma-client/enums";
import { deriveTransactionsRows } from "./transactions-data-derivation";

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
  value: MoneyInput;
  valueInReferenceCurrency?: MoneyInput | null;
  description?: string | null;
  transactionId?: string;
  transactionDescription?: string | null;
  transactionCreatedAt?: Date;
  account?: { id: string; name: string };
  unit?: Unit | null;
  currency?: string | null;
  cryptocurrency?: string | null;
  symbol?: string | null;
  tradeCurrency?: string | null;
  isOpeningBalancesTransaction?: boolean;
}) {
  return {
    id: args.id,
    date: args.date,
    description: args.description ?? null,
    value: toMoney(args.value),
    valueInReferenceCurrency:
      (args.valueInReferenceCurrency === undefined
        ? args.value
        : args.valueInReferenceCurrency) == null
        ? null
        : toMoney(
            (args.valueInReferenceCurrency === undefined
              ? args.value
              : args.valueInReferenceCurrency)!,
          ),
    unit: args.unit === undefined ? (Unit.CURRENCY as Unit | null) : args.unit,
    currency: args.currency === undefined ? "CHF" : args.currency,
    cryptocurrency: args.cryptocurrency ?? null,
    symbol: args.symbol ?? null,
    tradeCurrency: args.tradeCurrency ?? null,
    transactionId: args.transactionId ?? `transaction-${args.id}`,
    transactionDescription: args.transactionDescription ?? null,
    transactionCreatedAt: args.transactionCreatedAt ?? utcDate(2026, 0, 1, 12),
    account: args.account ?? { id: "cash", name: "Cash" },
    isOpeningBalancesTransaction: args.isOpeningBalancesTransaction ?? false,
  };
}

describe("deriveTransactionsRows", () => {
  test("groups bookings under transaction rows with summary accounts and earliest date", () => {
    const result = deriveTransactionsRows({
      referenceCurrency: "CHF",
      bookings: [
        createBooking({
          id: "salary",
          transactionId: "transaction-1",
          transactionDescription: "Salary",
          date: utcDate(2026, 0, 11),
          value: toMoney(100),
          account: { id: "bank", name: "Bank" },
        }),
        createBooking({
          id: "income",
          transactionId: "transaction-1",
          transactionDescription: "Salary",
          date: utcDate(2026, 0, 10),
          value: toMoney(-100),
          account: { id: "income", name: "Income" },
        }),
      ],
    });

    expect(result.rows).toEqual([
      expect.objectContaining({
        id: "transaction-1",
        transactionId: "transaction-1",
        date: "10.01.2026",
        debitAccounts: [{ id: "bank", name: "Bank" }],
        creditAccounts: [{ id: "income", name: "Income" }],
        description: "Salary",
      }),
    ]);
    expect(result.rows[0]?.bookings).toHaveLength(2);
  });

  test("deduplicates account and unit summaries while preserving detail booking fields", () => {
    const result = deriveTransactionsRows({
      referenceCurrency: "CHF",
      bookings: [
        createBooking({
          id: "debit-1",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(60),
          account: { id: "bank", name: "Bank" },
          description: "Booking text",
          transactionDescription: "Transaction text",
        }),
        createBooking({
          id: "debit-2",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(40),
          account: { id: "bank", name: "Bank" },
          transactionDescription: "Transaction text",
        }),
        createBooking({
          id: "credit",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(-100),
          unit: Unit.SECURITY,
          currency: null,
          symbol: "AAPL",
          tradeCurrency: "USD",
          account: { id: "broker", name: "Broker" },
        }),
      ],
    });

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        debitAccounts: [{ id: "bank", name: "Bank" }],
        creditAccounts: [{ id: "broker", name: "Broker" }],
        unitIdentifiers: ["AAPL"],
      }),
    );
    expect(result.rows[0]?.bookings).toEqual([
      expect.objectContaining({
        id: "debit-1",
        description: "Booking text",
        debit: 60,
        credit: null,
        referenceDebit: 60,
        referenceCredit: null,
      }),
      expect.objectContaining({
        id: "debit-2",
        description: "",
        debit: 40,
        credit: null,
      }),
      expect.objectContaining({
        id: "credit",
        unit: Unit.SECURITY,
        symbol: "AAPL",
        credit: 100,
      }),
    ]);
  });

  test("uses the higher converted debit or credit side as the reference amount", () => {
    const result = deriveTransactionsRows({
      referenceCurrency: "CHF",
      bookings: [
        createBooking({
          id: "debit",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(100),
          valueInReferenceCurrency: toMoney(120),
        }),
        createBooking({
          id: "credit",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(-100),
          valueInReferenceCurrency: toMoney(-110),
        }),
      ],
    });

    expect(result.rows[0]?.referenceAmount).toBe(120);
  });

  test("leaves reference amount empty when a required conversion is unavailable", () => {
    const result = deriveTransactionsRows({
      referenceCurrency: "CHF",
      bookings: [
        createBooking({
          id: "debit",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(100),
          valueInReferenceCurrency: toMoney(120),
        }),
        createBooking({
          id: "credit",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(-100),
          valueInReferenceCurrency: null,
        }),
      ],
    });

    expect(result.rows[0]?.referenceAmount).toBeNull();
  });

  test("sorts transactions by earliest booking date, creation date, and id", () => {
    const result = deriveTransactionsRows({
      referenceCurrency: "CHF",
      bookings: [
        createBooking({
          id: "older",
          transactionId: "transaction-b",
          date: utcDate(2026, 0, 10),
          value: toMoney(100),
          transactionCreatedAt: utcDate(2026, 0, 10, 9),
        }),
        createBooking({
          id: "newer-created",
          transactionId: "transaction-a",
          date: utcDate(2026, 0, 10),
          value: toMoney(100),
          transactionCreatedAt: utcDate(2026, 0, 10, 10),
        }),
        createBooking({
          id: "newest-date",
          transactionId: "transaction-c",
          date: utcDate(2026, 0, 11),
          value: toMoney(100),
          transactionCreatedAt: utcDate(2026, 0, 9, 10),
        }),
      ],
    });

    expect(result.rows.map((row) => row.transactionId)).toEqual([
      "transaction-c",
      "transaction-a",
      "transaction-b",
    ]);
  });

  test("shows original amount for a single non-reference unit", () => {
    const result = deriveTransactionsRows({
      referenceCurrency: "CHF",
      bookings: [
        createBooking({
          id: "debit",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(100),
          currency: "USD",
        }),
        createBooking({
          id: "credit",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(-100),
          currency: "USD",
        }),
      ],
    });

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        unitIdentifiers: ["USD"],
        originalAmount: 100,
        originalAmountUnit: Unit.CURRENCY,
        originalAmountCurrency: "USD",
        originalAmountCryptocurrency: null,
      }),
    );
  });

  test("leaves original amount empty for reference-currency-only transactions", () => {
    const result = deriveTransactionsRows({
      referenceCurrency: "CHF",
      bookings: [
        createBooking({
          id: "debit",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(100),
          currency: "CHF",
        }),
        createBooking({
          id: "credit",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(-100),
          currency: "CHF",
        }),
      ],
    });

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        unitIdentifiers: [],
        originalAmount: null,
        originalAmountUnit: null,
        originalAmountCurrency: null,
        originalAmountCryptocurrency: null,
      }),
    );
  });

  test("ignores reference currency when deriving a single non-reference amount", () => {
    const result = deriveTransactionsRows({
      referenceCurrency: "CHF",
      bookings: [
        createBooking({
          id: "debit-usd",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(100),
          currency: "USD",
        }),
        createBooking({
          id: "credit-usd",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(-100),
          currency: "USD",
        }),
        createBooking({
          id: "debit-chf",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(90),
          currency: "CHF",
        }),
        createBooking({
          id: "credit-chf",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(-90),
          currency: "CHF",
        }),
      ],
    });

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        unitIdentifiers: ["USD"],
        originalAmount: 100,
        originalAmountUnit: Unit.CURRENCY,
        originalAmountCurrency: "USD",
      }),
    );
  });

  test("leaves original amount empty for multiple non-reference units", () => {
    const result = deriveTransactionsRows({
      referenceCurrency: "CHF",
      bookings: [
        createBooking({
          id: "debit-usd",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(100),
          currency: "USD",
        }),
        createBooking({
          id: "credit-usd",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(-100),
          currency: "USD",
        }),
        createBooking({
          id: "debit-btc",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(1),
          unit: Unit.CRYPTOCURRENCY,
          currency: null,
          cryptocurrency: "BTC",
        }),
        createBooking({
          id: "credit-btc",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(-1),
          unit: Unit.CRYPTOCURRENCY,
          currency: null,
          cryptocurrency: "BTC",
        }),
      ],
    });

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        unitIdentifiers: ["USD", "BTC"],
        originalAmount: null,
        originalAmountUnit: null,
        originalAmountCurrency: null,
        originalAmountCryptocurrency: null,
      }),
    );
  });

  test("shows only the security symbol when reference currency and a security are present", () => {
    const result = deriveTransactionsRows({
      referenceCurrency: "CHF",
      bookings: [
        createBooking({
          id: "debit-chf",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(90),
          currency: "CHF",
        }),
        createBooking({
          id: "credit-chf",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(-90),
          currency: "CHF",
        }),
        createBooking({
          id: "debit-security",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(3),
          unit: Unit.SECURITY,
          currency: null,
          symbol: "AAPL",
          tradeCurrency: "USD",
        }),
        createBooking({
          id: "credit-security",
          transactionId: "transaction-1",
          date: utcDate(2026, 0, 10),
          value: toMoney(-3),
          unit: Unit.SECURITY,
          currency: null,
          symbol: "AAPL",
          tradeCurrency: "USD",
        }),
      ],
    });

    expect(result.rows[0]?.unitIdentifiers).toEqual(["AAPL"]);
  });
});
