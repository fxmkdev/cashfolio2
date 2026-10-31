import { describe, expect, it } from "vitest";
import {
  validateCreateSimpleTransactionInput,
  validateCreateTransactionInput,
  validateCreateTransactionsInput,
  validateDeleteTransactionInput,
  validateRebookBookingInput,
  validateUpdateTransactionInput,
} from "./transactions-input-validation";

const booking = {
  date: "2026-01-01",
  accountId: "account-1",
  description: "",
  unit: "CURRENCY",
  currency: "CHF",
  value: 10.25,
};
const transaction = {
  accountBookId: "book-1",
  description: "",
  bookings: [booking, { ...booking, value: -10.25 }],
};
const simple = {
  accountBookId: "book-1",
  accountId: "account-1",
  counterAccountId: "account-2",
  date: "2026-01-01T00:00:00.000Z",
  description: "",
  amount: 10.25,
  direction: "DEBIT",
};

describe("transaction mutation input contracts", () => {
  it("accepts the exact import limit and rejects excess before inspecting nested payloads", () => {
    expect(
      validateCreateTransactionsInput({
        accountBookId: "book",
        transactions: Array(1000).fill(transaction),
      }).transactions,
    ).toHaveLength(1000);
    expect(() =>
      validateCreateTransactionsInput({
        accountBookId: "book",
        transactions: Array(1001).fill(null),
      }),
    ).toThrow("1'000");
  });
  it("bounds per-transaction and aggregate bookings before parsing individual bookings", () => {
    expect(() =>
      validateCreateTransactionInput({
        ...transaction,
        bookings: Array(101).fill(null),
      }),
    ).toThrow("100");
    const heavy = { ...transaction, bookings: Array(100).fill(booking) };
    expect(
      validateCreateTransactionsInput({
        accountBookId: "book",
        transactions: Array(50).fill(heavy),
      }).transactions,
    ).toHaveLength(50);
    expect(() =>
      validateCreateTransactionsInput({
        accountBookId: "book",
        transactions: Array(51).fill(heavy),
      }),
    ).toThrow("5’000");
  });
  it("bounds descriptions and instrument codes without truncating accepted data", () => {
    expect(
      validateCreateTransactionInput({
        ...transaction,
        description: "x".repeat(4000),
      }).description,
    ).toHaveLength(4000);
    expect(() =>
      validateCreateTransactionInput({
        ...transaction,
        description: "x".repeat(4001),
      }),
    ).toThrow("4'000");
    expect(() =>
      validateCreateTransactionInput({
        ...transaction,
        bookings: [{ ...booking, currency: "x".repeat(65) }],
      }),
    ).toThrow("64");
  });
  it("accepts empty descriptions and strips unknown fields at every level", () => {
    expect(
      validateCreateTransactionInput({
        ...transaction,
        ignored: true,
        bookings: transaction.bookings.map((entry) => ({
          ...entry,
          ignored: true,
        })),
      }),
    ).toMatchObject(transaction);
    expect(
      validateCreateTransactionInput({ ...transaction, ignored: true }),
    ).not.toHaveProperty("ignored");
    expect(
      validateCreateTransactionInput({
        ...transaction,
        bookings: [{ ...booking, ignored: true }],
      }).bookings[0],
    ).not.toHaveProperty("ignored");
    expect(
      validateUpdateTransactionInput({ ...transaction, transactionId: "tx-1" }),
    ).toMatchObject({ ...transaction, transactionId: "tx-1" });
  });

  it("accepts currency, crypto, and security bookings", () => {
    for (const entry of [
      booking,
      { ...booking, unit: "CRYPTOCURRENCY", cryptocurrency: "BTC" },
      { ...booking, unit: "SECURITY", symbol: "AAPL", tradeCurrency: "USD" },
    ]) {
      expect(
        validateCreateTransactionInput({ ...transaction, bookings: [entry] })
          .bookings[0],
      ).toMatchObject(entry);
    }
  });

  it.each([
    ["date", 1],
    ["date", "2026-02-30"],
    ["date", "2026-01-01T12:00:00.000Z"],
    ["date", new Date("2026-01-01")],
    ["accountId", " "],
    ["description", null],
    ["unit", "OTHER"],
    ["currency", undefined],
    ["currency", " "],
    ["cryptocurrency", 1],
    ["symbol", {}],
    ["tradeCurrency", null],
    ["value", "10.25"],
    ["value", NaN],
    ["value", Infinity],
    ["value", -Infinity],
  ])(
    "rejects malformed booking %s (%j) for create, update, and batch",
    (field, value) => {
      const input = {
        ...transaction,
        bookings: [booking, { ...booking, [field as string]: value }],
      };
      expect(() => validateCreateTransactionInput(input)).toThrow();
      expect(() =>
        validateUpdateTransactionInput({ ...input, transactionId: "tx-1" }),
      ).toThrow();
      expect(() =>
        validateCreateTransactionsInput({
          accountBookId: "book-1",
          transactions: [transaction, input],
        }),
      ).toThrow();
    },
  );

  it("requires unit-specific identifiers for crypto and security bookings", () => {
    for (const entry of [
      { ...booking, unit: "CRYPTOCURRENCY" },
      { ...booking, unit: "SECURITY", symbol: "AAPL" },
      { ...booking, unit: "SECURITY", tradeCurrency: "USD" },
    ]) {
      expect(() =>
        validateCreateTransactionInput({ ...transaction, bookings: [entry] }),
      ).toThrow();
    }
  });

  it("checks nested object and array shapes including sparse arrays", () => {
    for (const bookings of [null, {}, [null], ["booking"], new Array(1)]) {
      expect(() =>
        validateCreateTransactionInput({ ...transaction, bookings }),
      ).toThrow();
    }
    for (const transactions of [
      null,
      {},
      [null],
      ["transaction"],
      new Array(1),
    ]) {
      expect(() =>
        validateCreateTransactionsInput({
          accountBookId: "book-1",
          transactions,
        }),
      ).toThrow();
    }
    expect(() =>
      validateCreateTransactionInput({
        ...transaction,
        description: undefined,
      }),
    ).toThrow("description must be a string.");
    expect(() => validateUpdateTransactionInput(transaction)).toThrow(
      "Transaction id is required.",
    );
  });

  it("keeps the batch account book as the sole scope", () => {
    const parsed = validateCreateTransactionsInput({
      accountBookId: "book-1",
      transactions: [{ ...transaction, accountBookId: "other-book" }],
    });
    expect(parsed.accountBookId).toBe("book-1");
    expect(parsed.transactions[0]).not.toHaveProperty("accountBookId");
    expect(parsed.transactions[0]).toMatchObject({
      description: "",
      bookings: transaction.bookings,
    });
    expect(
      validateCreateTransactionsInput({
        accountBookId: "book-1",
        transactions: [],
      }).transactions,
    ).toEqual([]);
  });

  it.each([
    ["accountBookId", ""],
    ["accountId", null],
    ["counterAccountId", " "],
    ["date", "invalid"],
    ["description", 1],
    ["amount", NaN],
    ["amount", "10"],
    ["direction", "OTHER"],
  ])("rejects malformed simple transaction %s", (field, value) => {
    expect(() =>
      validateCreateSimpleTransactionInput({
        ...simple,
        [field as string]: value,
      }),
    ).toThrow();
  });

  it("accepts both simple transaction directions", () => {
    expect(validateCreateSimpleTransactionInput(simple)).toEqual(simple);
    expect(
      validateCreateSimpleTransactionInput({ ...simple, direction: "CREDIT" })
        .direction,
    ).toBe("CREDIT");
  });

  it("requires IDs for rebooking and deletion", () => {
    expect(
      validateRebookBookingInput({
        accountBookId: "book-1",
        bookingId: "b-1",
        targetAccountId: "a-2",
        ignored: true,
      }),
    ).toEqual({
      accountBookId: "book-1",
      bookingId: "b-1",
      targetAccountId: "a-2",
    });
    expect(
      validateDeleteTransactionInput({
        accountBookId: "book-1",
        transactionId: "tx-1",
      }),
    ).toEqual({ accountBookId: "book-1", transactionId: "tx-1" });
    expect(() =>
      validateRebookBookingInput({ accountBookId: "book-1", bookingId: "b-1" }),
    ).toThrow("Target account id is required.");
    expect(() =>
      validateDeleteTransactionInput({ accountBookId: "book-1" }),
    ).toThrow("Transaction id is required.");
  });

  it.each([null, undefined, [], 1, "transaction"])(
    "rejects non-object inputs (%j)",
    (input) => {
      for (const validate of [
        validateCreateTransactionInput,
        validateCreateTransactionsInput,
        validateUpdateTransactionInput,
        validateCreateSimpleTransactionInput,
        validateRebookBookingInput,
        validateDeleteTransactionInput,
      ]) {
        expect(() => validate(input)).toThrow("Input must be an object.");
      }
    },
  );
});
