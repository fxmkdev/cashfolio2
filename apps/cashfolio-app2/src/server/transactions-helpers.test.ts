import { describe, expect, test, vi } from "vitest";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
vi.mock("../prisma.server", () => ({
  prisma: {},
}));
import {
  validateAccountTypeBookingsWithAccounts,
  type AccountTypeMeta,
} from "./transactions-helpers";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "../shared/opening-balances";

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
        {
          accountBookStartDate: new Date("2026-01-03T00:00:00.000Z"),
        },
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
        {
          accountBookStartDate: new Date("2026-01-03T00:00:00.000Z"),
        },
      ),
    ).toThrow("Expense accounts cannot have credit entries.");
  });

  test("rejects opening-balance bookings through transaction APIs", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "opening",
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

  test("rejects non-opening bookings before account-book start date", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "income",
            value: -100,
            date: "2026-01-03T08:00:00.000Z",
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
            value: -100,
            date: "2026-01-04T08:00:00.000Z",
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
