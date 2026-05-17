import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
const prisma = vi.hoisted(() => ({
  account: {
    findMany: vi.fn(),
  },
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
}));
vi.mock("../../prisma.server", () => ({
  prisma,
}));
import {
  accountTypeMeta,
  buildTransactionCreateData,
  validateAccountTypeBookings,
  validateAccountTypeBookingsWithAccounts,
  type AccountTypeMeta,
  validateCreateTransaction,
} from "./transactions-helpers";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "../../shared/opening-balances";
import { GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE } from "../../shared/gain-loss-transaction-invariant";

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
    [
      "gain-loss",
      {
        id: "gain-loss",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
      },
    ],
    [
      "asset",
      {
        id: "asset",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
      },
    ],
    [
      "liability",
      {
        id: "liability",
        type: AccountType.LIABILITY,
        equityAccountSubtype: null,
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

const FIXED_SYSTEM_TIME = new Date("2026-02-01T12:00:00.000Z");

describe("transactions helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_SYSTEM_TIME);
    vi.clearAllMocks();
    prisma.account.findMany.mockResolvedValue([]);
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      startDate: new Date("2026-01-03T00:00:00.000Z"),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
      "Booking 0: currency is required. Booking 1: invalid date. Booking 1: symbol and trade currency are required for security bookings.",
    );
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

  test("builds nested transaction create payload with stable sort order", () => {
    const result = buildTransactionCreateData({
      accountBookId: "book-1",
      description: "new transaction",
      bookings: [
        {
          date: "2026-01-03T00:00:00.000Z",
          accountId: "asset-1",
          description: "first",
          unit: Unit.CURRENCY,
          currency: "CHF",
          value: 50,
        },
        {
          date: "2026-01-03T00:00:00.000Z",
          accountId: "equity-1",
          description: "second",
          unit: Unit.CURRENCY,
          currency: "CHF",
          value: -50,
        },
      ],
    });

    expect(result).toMatchObject({
      description: "new transaction",
      accountBookId: "book-1",
      bookings: {
        create: [
          {
            description: "first",
            value: 50,
            sortOrder: 0,
            account: {
              connect: {
                id_accountBookId: {
                  id: "asset-1",
                  accountBookId: "book-1",
                },
              },
            },
          },
          {
            description: "second",
            value: -50,
            sortOrder: 1,
            account: {
              connect: {
                id_accountBookId: {
                  id: "equity-1",
                  accountBookId: "book-1",
                },
              },
            },
          },
        ],
      },
    });
  });

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
            value: 100,
            date: "2026-01-03T00:00:00.000Z",
          },
        ],
        "book-1",
      ),
    ).rejects.toThrow("Income accounts cannot have debit entries.");

    expect(prisma.account.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["income"] }, accountBookId: "book-1" },
      select: { id: true, type: true, equityAccountSubtype: true },
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
        type: AccountType.LIABILITY,
        equityAccountSubtype: null,
      }),
    ).toEqual({
      id: "account-1",
      type: AccountType.LIABILITY,
      equityAccountSubtype: null,
    });
  });

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

  test("accepts gain/loss with one asset booking", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "gain-loss",
            value: -100,
            date: "2026-01-04T08:00:00.000Z",
          },
          {
            accountId: "asset",
            value: 100,
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

  test("rejects gain/loss transactions with more than two bookings", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "gain-loss",
            value: -100,
            date: "2026-01-04T08:00:00.000Z",
          },
          {
            accountId: "asset",
            value: 40,
            date: "2026-01-04T08:00:00.000Z",
          },
          {
            accountId: "liability",
            value: 60,
            date: "2026-01-04T08:00:00.000Z",
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
            value: -100,
            date: "2026-01-04T08:00:00.000Z",
          },
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
    ).toThrow(GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE);
  });

  test("rejects two gain/loss bookings", () => {
    expect(() =>
      validateAccountTypeBookingsWithAccounts(
        [
          {
            accountId: "gain-loss",
            value: -100,
            date: "2026-01-04T08:00:00.000Z",
          },
          {
            accountId: "gain-loss",
            value: 100,
            date: "2026-01-04T08:00:00.000Z",
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
