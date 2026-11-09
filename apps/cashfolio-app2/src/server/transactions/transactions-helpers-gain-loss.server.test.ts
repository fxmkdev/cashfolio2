import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Unit } from "../../.prisma-client/enums";
import {
  cleanupTransactionHelpers,
  createAccountMap,
  GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE,
  resetTransactionHelpers,
  validateAccountTypeBookingsWithAccounts,
} from "./transactions-helpers.server.test-support";
describe("transactions helpers", () => {
  beforeEach(resetTransactionHelpers);
  afterEach(cleanupTransactionHelpers);

  test("accepts gain/loss with one asset booking", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "gain-loss",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -100,
            date: "2026-01-04T00:00:00.000Z",
          },
          {
            accountId: "asset",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 100,
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

  test("rejects gain/loss transactions with more than two bookings", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "gain-loss",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -100,
            date: "2026-01-04T00:00:00.000Z",
          },
          {
            accountId: "asset",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 40,
            date: "2026-01-04T00:00:00.000Z",
          },
          {
            accountId: "liability",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 60,
            date: "2026-01-04T00:00:00.000Z",
          },
        ],
        createAccountMap(),
        {
          accountBookStartDate: new Date("2026-01-04T16:00:00.000Z"),
        },
      ),
    ).toThrow(GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE);
  });

  test("rejects gain/loss paired with non asset/liability account", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "gain-loss",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -100,
            date: "2026-01-04T00:00:00.000Z",
          },
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
    ).toThrow(GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE);
  });

  test("rejects two gain/loss bookings", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "gain-loss",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -100,
            date: "2026-01-04T00:00:00.000Z",
          },
          {
            accountId: "gain-loss",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 100,
            date: "2026-01-04T00:00:00.000Z",
          },
        ],
        createAccountMap(),
        {
          accountBookStartDate: new Date("2026-01-04T16:00:00.000Z"),
        },
      ),
    ).toThrow(GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE);
  });
});
