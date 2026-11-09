import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Unit } from "../../.prisma-client/enums";
import {
  cleanupTransactionHelpers,
  createAccountMap,
  resetTransactionHelpers,
  validateAccountTypeBookingsWithAccounts,
  validateCreateTransaction,
} from "./transactions-helpers.server.test-support";
describe("transactions helpers", () => {
  beforeEach(resetTransactionHelpers);
  afterEach(cleanupTransactionHelpers);

  test("rejects invalid booking dates and missing unit metadata", () => {
    expect(() =>
      validateCreateTransaction({
        accountBookId: "book-1",
        description: "validation errors",
        bookings: [
          {
            date: "2999-01-03T00:00:00.000Z",
            accountId: "asset-1",
            description: "",
            unit: Unit.CURRENCY,
            value: 120,
          },
          {
            date: "invalid-date",
            accountId: "asset-2",
            description: "",
            unit: Unit.SECURITY,
            symbol: "AAPL",
            value: -120,
          },
        ],
      }),
    ).toThrow(
      "Booking 0: currency is required. Booking 1: date must be a valid UTC day. Booking 1: symbol and trade currency are required for security bookings.",
    );
  });

  test("rejects non-canonical time-bearing booking dates", () => {
    expect(() =>
      validateCreateTransaction({
        accountBookId: "book-1",
        description: "shifted local date",
        bookings: [
          {
            date: "2026-05-17T22:00:00.000Z",
            accountId: "asset-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 120,
          },
          {
            date: "2026-05-17T22:00:00.000Z",
            accountId: "equity-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -120,
          },
        ],
      }),
    ).toThrow("Booking 0: date must be a valid UTC day.");
  });

  test("allows future booking dates", () => {
    expect(() =>
      validateCreateTransaction({
        accountBookId: "book-1",
        description: "scheduled transaction",
        bookings: [
          {
            date: "2026-03-03T00:00:00.000Z",
            accountId: "asset-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 120,
          },
          {
            date: "2026-03-03T00:00:00.000Z",
            accountId: "equity-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -120,
          },
        ],
      }),
    ).not.toThrow();
  });

  test("rejects non-opening bookings before account-book start date", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "income",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -100,
            date: "2026-01-03T00:00:00.000Z",
          },
        ],
        createAccountMap(),
        {
          accountBookStartDate: new Date("2026-01-04T16:00:00.000Z"),
        },
      ),
    ).toThrow("Date cannot be before account book start date (2026-01-04).");
  });

  test("accepts non-opening bookings on account-book start date", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "income",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -100,
            date: "2026-01-04T00:00:00.000Z",
          },
        ],
        createAccountMap(),
        {
          accountBookStartDate: new Date("2026-01-04T16:00:00.000Z"),
        },
      ),
    ).not.toThrow();
  });
});
