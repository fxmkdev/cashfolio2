import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import {
  accountTypeMeta,
  cleanupTransactionHelpers,
  createAccountMap,
  OPENING_BALANCES_MANAGEMENT_MESSAGE,
  prisma,
  resetTransactionHelpers,
  validateAccountTypeBookings,
  validateAccountTypeBookingsWithAccounts,
} from "./transactions-helpers.server.test-support";
describe("transactions helpers", () => {
  beforeEach(resetTransactionHelpers);
  afterEach(cleanupTransactionHelpers);

  test("loads account metadata when validating account type booking rules", async () => {
    prisma.account.findMany.mockResolvedValue([
      {
        id: "income",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.INCOME,
      },
    ]);
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      startDate: new Date("2026-01-03T00:00:00.000Z"),
    });

    await expect(
      validateAccountTypeBookings(
        [
          {
            accountId: "income",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 100,
            date: "2026-01-03T00:00:00.000Z",
          },
        ],
        "book-1",
      ),
    ).rejects.toThrow("Income categories cannot have debit entries.");

    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["income"] }, accountBookId: "book-1" },
      select: {
        id: true,
        type: true,
        equityAccountSubtype: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
      },
    });
    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "book-1" },
      select: { startDate: true },
    });
  });

  test("skips account lookups for empty account lists", async () => {
    await expect(validateAccountTypeBookings([], "book-1")).resolves.toBe(
      undefined,
    );
    expect(prisma.account.findMany).not.toHaveBeenCalled();
    expect(prisma.accountBook.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  test("maps account type metadata without altering values", () => {
    expect(
      accountTypeMeta({
        id: "account-1",
        type: AccountType.BALANCE,
        equityAccountSubtype: null,
        unit: Unit.SECURITY,
        currency: null,
        cryptocurrency: null,
        symbol: "AAPL",
        tradeCurrency: "USD",
      }),
    ).toEqual({
      id: "account-1",
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      unit: Unit.SECURITY,
      currency: null,
      cryptocurrency: null,
      symbol: "AAPL",
      tradeCurrency: "USD",
    });
  });

  test("keeps income/expense sign rules unchanged", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "income",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 10,
            date: "2026-01-03T00:00:00.000Z",
          },
        ],
        createAccountMap(),
        {
          accountBookStartDate: new Date("2026-01-03T00:00:00.000Z"),
        },
      ),
    ).toThrow("Income categories cannot have debit entries.");

    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "expense",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -10,
            date: "2026-01-03T00:00:00.000Z",
          },
        ],
        createAccountMap(),
        {
          accountBookStartDate: new Date("2026-01-03T00:00:00.000Z"),
        },
      ),
    ).toThrow("Expense categories cannot have credit entries.");
  });

  test("rejects opening-balance bookings through transaction APIs", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "opening",
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
    ).toThrow(OPENING_BALANCES_MANAGEMENT_MESSAGE);
  });
});
