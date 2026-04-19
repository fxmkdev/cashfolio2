import { describe, expect, test, vi } from "vitest";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
vi.mock("../prisma.server", () => ({
  prisma: {},
}));
import {
  validateAccountTypeBookingsWithAccounts,
  type AccountTypeMeta,
} from "./transactions-helpers";

function createAccountMap(
  overrides?: Partial<Record<string, AccountTypeMeta>>,
) {
  const base = new Map<string, AccountTypeMeta>([
    [
      "income",
      {
        id: "income",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.INCOME,
      },
    ],
    [
      "expense",
      {
        id: "expense",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      },
    ],
    [
      "opening",
      {
        id: "opening",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
      },
    ],
  ]);

  for (const [id, meta] of Object.entries(overrides ?? {})) {
    if (meta) {
      base.set(id, meta);
    }
  }

  return base;
}

describe("validateAccountTypeBookingsWithAccounts", () => {
  test("keeps income/expense sign rules unchanged", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "income",
            value: 10,
            date: "2026-01-03T00:00:00.000Z",
          },
        ],
        createAccountMap(),
      ),
    ).toThrow("Income accounts cannot have debit entries.");

    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "expense",
            value: -10,
            date: "2026-01-03T00:00:00.000Z",
          },
        ],
        createAccountMap(),
      ),
    ).toThrow("Expense accounts cannot have credit entries.");
  });

  test("rejects opening-balance bookings on non-opening day", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "opening",
            value: -100,
            date: "2026-01-02T00:00:00.000Z",
          },
        ],
        createAccountMap(),
        {
          accountBookStartDate: new Date("2026-01-04T16:00:00.000Z"),
        },
      ),
    ).toThrow("Opening Balances bookings must be dated 2026-01-03.");
  });

  test("accepts opening-balance bookings on account-book start-date minus one day", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "opening",
            value: -100,
            date: "2026-01-03T08:00:00.000Z",
          },
          {
            accountId: "opening",
            value: 100,
            date: "2026-01-03T08:00:00.000Z",
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
