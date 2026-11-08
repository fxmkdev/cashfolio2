import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Unit } from "../../.prisma-client/enums";
import {
  cleanupTransactionHelpers,
  resetTransactionHelpers,
  validateCreateTransaction,
} from "./transactions-helpers.server.test-support";
describe("transactions helpers", () => {
  beforeEach(resetTransactionHelpers);
  afterEach(cleanupTransactionHelpers);

  test("requires at least two bookings for transaction creation", () => {
    expect(() =>
      validateCreateTransaction({
        accountBookId: "book-1",
        description: "single booking",
        bookings: [
          {
            date: "2026-01-03T00:00:00.000Z",
            accountId: "asset-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 100,
          },
        ],
      }),
    ).toThrow("At least two bookings are required.");
  });

  test("requires balancing sum for bookings in the same unit", () => {
    expect(() =>
      validateCreateTransaction({
        accountBookId: "book-1",
        description: "unbalanced",
        bookings: [
          {
            date: "2026-01-03T00:00:00.000Z",
            accountId: "asset-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 120,
          },
          {
            date: "2026-01-03T00:00:00.000Z",
            accountId: "equity-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -100,
          },
        ],
      }),
    ).toThrow("The sum of all bookings must be zero.");
  });

  test("allows mixed-unit simple transfers without enforcing sum-to-zero", () => {
    expect(() =>
      validateCreateTransaction({
        accountBookId: "book-1",
        description: "mixed units",
        bookings: [
          {
            date: "2026-01-03T00:00:00.000Z",
            accountId: "asset-1",
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 120,
          },
          {
            date: "2026-01-03T00:00:00.000Z",
            accountId: "crypto-1",
            description: "",
            unit: Unit.CRYPTOCURRENCY,
            cryptocurrency: "BTC",
            value: -90,
          },
        ],
      }),
    ).not.toThrow();
  });
});
