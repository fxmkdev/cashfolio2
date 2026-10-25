import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../.prisma-client/client";
import { ACCOUNT_BOOK_BUSY_MESSAGE } from "../../shared/mutation-errors";
import {
  AssetClass,
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";

const createServerFn = vi.hoisted(() =>
  vi.fn(() => {
    let validate: ((data: unknown) => unknown) | undefined;
    const chain = {
      validator: vi.fn((validator: (data: unknown) => unknown) => {
        validate = validator;
        return chain;
      }),
      handler: vi.fn((handler: ({ data }: { data: unknown }) => unknown) => {
        return async ({ data }: { data: unknown }) => {
          const validatedData = validate ? validate(data) : data;
          return handler({ data: validatedData });
        };
      }),
    };
    return chain;
  }),
);

const ensureAuthorizedForAccountBookId = vi.hoisted(() => vi.fn());
const ensureSameOriginRequestFromServerContext = vi.hoisted(() => vi.fn());
const validateAccountInput = vi.hoisted(() => vi.fn());
const validateAccountGroupInput = vi.hoisted(() => vi.fn());
const invalidatePeriodBaseDataCacheForAccountBook = vi.hoisted(() => vi.fn());

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  account: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  accountGroup: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  booking: {
    deleteMany: vi.fn(),
  },
}));

const prisma = vi.hoisted(() => ({ $transaction: vi.fn() }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("../../security/same-origin.server", () => ({
  ensureSameOriginRequestFromServerContext,
}));

vi.mock("../../shared/account-validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../shared/account-validation")>()),
  validateAccountInput,
  validateAccountGroupInput,
}));

vi.mock("../../prisma.server", () => ({
  prisma,
}));

vi.mock("../period/cache/period-base-data-cache", () => ({
  invalidatePeriodBaseDataCacheForAccountBook,
}));

vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

import {
  setAccountsAssetClass,
  moveAccounts,
  archiveAccount,
  archiveAccountGroup,
  createAccount,
  createAccountGroup,
  deleteAccount,
  deleteAccountGroup,
  reorderAccountTreeItems,
  unarchiveAccount,
  unarchiveAccountGroup,
  updateAccount,
  updateAccountGroup,
} from "./accounts-mutations";

describe("account mutation boundary validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [
      createAccount,
      { accountBookId: "book-1", name: 123, type: AccountType.BALANCE },
    ],
    [
      updateAccount,
      {
        accountBookId: "book-1",
        id: "a-1",
        name: "Name",
        type: AccountType.BALANCE,
        openingBalance: "100",
      },
    ],
    [
      createAccountGroup,
      { accountBookId: "book-1", name: "Name", type: "OTHER" },
    ],
    [
      updateAccountGroup,
      {
        accountBookId: "book-1",
        id: "g-1",
        name: "Name",
        type: AccountType.BALANCE,
        isCashAccount: "true",
      },
    ],
    [
      reorderAccountTreeItems,
      {
        accountBookId: "book-1",
        updates: [{ id: "a-1", nodeType: "account", sortOrder: 0.5 }],
      },
    ],
    ...[
      archiveAccount,
      archiveAccountGroup,
      unarchiveAccount,
      unarchiveAccountGroup,
      deleteAccount,
      deleteAccountGroup,
    ].map(
      (mutation) => [mutation, { accountBookId: "book-1", id: null }] as const,
    ),
  ] as const)(
    "rejects malformed data before authorization, operations, or invalidation (%#)",
    async (mutation, data) => {
      await expect(mutation({ data })).rejects.toThrow();
      expect(ensureAuthorizedForAccountBookId).not.toHaveBeenCalled();
      expect(ensureSameOriginRequestFromServerContext).not.toHaveBeenCalled();
      expect(tx.account.findMany).not.toHaveBeenCalled();
      expect(tx.account.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(tx.accountGroup.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(
        invalidatePeriodBaseDataCacheForAccountBook,
      ).not.toHaveBeenCalled();
    },
  );
});

describe("updateAccount opening balance management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: "book-1" }]);

    tx.account.findMany.mockResolvedValue([]);
    tx.account.findUniqueOrThrow.mockResolvedValue({
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      isCashAccount: false,
    });
    tx.accountGroup.findUniqueOrThrow.mockImplementation(async ({ where }) => ({
      type:
        where.id_accountBookId.id === "group-expenses"
          ? AccountType.EQUITY
          : AccountType.BALANCE,
      equityAccountSubtype: null,
      isCashAccount: false,
      isActive: true,
    }));
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    tx.account.update.mockResolvedValue({
      id: "account-1",
      name: "Cash",
      type: AccountType.BALANCE,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      isCashAccount: false,
    });
    tx.account.updateMany.mockResolvedValue({ count: 0 });
    tx.accountGroup.update.mockResolvedValue({
      id: "group-1",
      name: "Group",
      type: AccountType.BALANCE,
      isCashAccount: false,
    });
    tx.accountGroup.updateMany.mockResolvedValue({ count: 0 });
    tx.accountGroup.findMany.mockResolvedValue([]);
    tx.account.findFirst.mockResolvedValue(null);
    tx.account.create.mockResolvedValue({ id: "opening-account" });
    tx.accountBook.findUniqueOrThrow.mockResolvedValue({
      startDate: new Date("2026-01-10T00:00:00.000Z"),
    });
    tx.transaction.create.mockResolvedValue({ id: "tx-created" });
    tx.transaction.update.mockResolvedValue({ id: "tx-open" });
    tx.transaction.deleteMany.mockResolvedValue({ count: 0 });
    tx.booking.deleteMany.mockResolvedValue({ count: 0 });
  });

  it.each([AccountType.BALANCE])(
    "creates accounts in a %s parent with explicit cash inheritance",
    async (parentType) => {
      tx.accountGroup.findUniqueOrThrow.mockResolvedValueOnce({
        type: parentType,
        equityAccountSubtype: null,
        isActive: true,
        isCashAccount: true,
      });
      await createAccount({
        data: {
          accountBookId: "book-1",
          name: "Card",
          type: AccountType.BALANCE,
          unit: Unit.CURRENCY,
          currency: "CHF",
          groupId: "banking",
        },
      });
      expect(tx.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: AccountType.BALANCE,
          groupId: "banking",
          isCashAccount: true,
        }),
      });
      expect(tx.accountGroup.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id_accountBookId: { id: "banking", accountBookId: "book-1" },
          },
        }),
      );
    },
  );

  it.each([
    {
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.INCOME,
      isActive: true,
    },
    { type: AccountType.BALANCE, equityAccountSubtype: null, isActive: false },
  ])(
    "rejects an incompatible parent before creating an account: %j",
    async (parent) => {
      tx.accountGroup.findUniqueOrThrow.mockResolvedValueOnce({
        ...parent,
        isCashAccount: false,
      });
      await expect(
        createAccount({
          data: {
            accountBookId: "book-1",
            name: "Bank",
            type: AccountType.BALANCE,
            unit: Unit.CURRENCY,
            currency: "CHF",
            groupId: "parent",
          },
        }),
      ).rejects.toThrow();
      expect(tx.account.create).not.toHaveBeenCalled();
    },
  );

  it("rejects parents outside the current account book", async () => {
    tx.accountGroup.findUniqueOrThrow.mockRejectedValueOnce(
      new Error("Record not found"),
    );
    await expect(
      createAccount({
        data: {
          accountBookId: "book-1",
          name: "Bank",
          type: AccountType.BALANCE,
          unit: Unit.CURRENCY,
          currency: "CHF",
          groupId: "foreign-parent",
        },
      }),
    ).rejects.toThrow("Record not found");
    expect(tx.account.create).not.toHaveBeenCalled();
  });

  it("updates editable account fields without rewriting unit identity fields", async () => {
    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Cash renamed",
        type: AccountType.BALANCE,
        groupId: "group-1",
        sortOrder: 7,
      },
    });

    expect(validateAccountInput).toHaveBeenCalledWith(
      expect.objectContaining({
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: undefined,
        symbol: undefined,
        tradeCurrency: undefined,
        isCashAccount: false,
      }),
      [],
    );
    expect(tx.account.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "account-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({
        name: "Cash renamed",
        groupId: "group-1",
        sortOrder: 7,
        isCashAccount: false,
      }),
    });
  });

  it.each([undefined, null, ...Object.values(AssetClass)])(
    "creates accounts with explicit classification %s",
    async (assetClass) => {
      await createAccount({
        data: {
          accountBookId: "book-1",
          name: "Portfolio",
          type: AccountType.BALANCE,
          unit: Unit.CURRENCY,
          currency: "CHF",
          assetClass,
        },
      });
      expect(tx.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ assetClass: assetClass ?? null }),
      });
    },
  );

  it.each([undefined, null, AssetClass.OTHER_ASSETS])(
    "updates classification %s without rewriting valuation or bookings",
    async (assetClass) => {
      tx.account.findUniqueOrThrow.mockResolvedValueOnce({
        type: AccountType.BALANCE,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        statementImportCsvFormat: null,
        isCashAccount: false,
        assetClass: AssetClass.EQUITIES,
      });
      await updateAccount({
        data: {
          id: "account-1",
          accountBookId: "book-1",
          name: "Portfolio",
          type: AccountType.BALANCE,
          assetClass,
        },
      });
      const written = tx.account.update.mock.calls[0]![0].data;
      expect(written.assetClass).toBe(
        assetClass === undefined ? AssetClass.EQUITIES : assetClass,
      );
      expect(written).not.toHaveProperty("unit");
      expect(written).not.toHaveProperty("currency");
      expect(written.isCashAccount).toBe(false);
      expect(tx.transaction.create).not.toHaveBeenCalled();
      expect(tx.transaction.update).not.toHaveBeenCalled();
      expect(tx.transaction.deleteMany).not.toHaveBeenCalled();
      expect(tx.booking.deleteMany).not.toHaveBeenCalled();
      expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
        "book-1",
      );
    },
  );

  it("ignores stale submitted unit identity fields when updating unitless equity accounts", async () => {
    const actual = await vi.importActual<
      typeof import("../../shared/account-validation")
    >("../../shared/account-validation");
    validateAccountInput.mockImplementationOnce(actual.validateAccountInput);
    tx.account.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      unit: null,
      currency: null,
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    });
    tx.account.update.mockResolvedValueOnce({
      id: "account-1",
      name: "Groceries renamed",
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      unit: null,
      currency: null,
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    });

    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Groceries renamed",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        groupId: "group-expenses",
        sortOrder: 2,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: "BTC",
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
    });

    expect(validateAccountInput).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        unit: undefined,
        currency: undefined,
        cryptocurrency: undefined,
        symbol: undefined,
        tradeCurrency: undefined,
        isCashAccount: false,
      }),
      [],
    );
    expect(tx.account.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "account-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({
        name: "Groceries renamed",
        groupId: "group-expenses",
        sortOrder: 2,
        isCashAccount: false,
      }),
    });
  });

  it("stores newly created equity accounts without hidden unit identity fields", async () => {
    const actual = await vi.importActual<
      typeof import("../../shared/account-validation")
    >("../../shared/account-validation");
    validateAccountInput.mockImplementationOnce(actual.validateAccountInput);
    tx.account.create.mockResolvedValueOnce({
      id: "account-2",
      name: "Groceries",
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      unit: null,
      currency: null,
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    });

    await createAccount({
      data: {
        accountBookId: "book-1",
        name: "Groceries",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        groupId: "group-expenses",
        sortOrder: 1,
        unit: Unit.CURRENCY,
        currency: "CHF",
        cryptocurrency: "BTC",
        symbol: "AAPL",
        tradeCurrency: "USD",
      },
    });

    expect(validateAccountInput).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        unit: undefined,
        currency: undefined,
        cryptocurrency: undefined,
        symbol: undefined,
        tradeCurrency: undefined,
        isCashAccount: false,
      }),
      [],
    );
    expect(tx.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Groceries",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.EXPENSE,
        groupId: "group-expenses",
        sortOrder: 1,
        unit: undefined,
        currency: undefined,
        cryptocurrency: undefined,
        symbol: undefined,
        tradeCurrency: undefined,
        isCashAccount: false,
        accountBookId: "book-1",
      }),
    });
  });

  it("persists statement import CSV formats when creating accounts", async () => {
    const statementImportCsvFormat = {
      hasHeader: true,
      delimitersToGuess: [";"],
      columns: ["date", "amount", "description"],
    };
    tx.account.create.mockResolvedValueOnce({
      id: "account-2",
      name: "Checking",
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    });

    await createAccount({
      data: {
        accountBookId: "book-1",
        name: "Checking",
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "CHF",
        statementImportCsvFormat,
      },
    });

    expect(validateAccountInput).toHaveBeenCalledWith(
      expect.objectContaining({ statementImportCsvFormat }),
      [],
    );
    expect(tx.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ statementImportCsvFormat }),
    });
  });

  it("persists statement import CSV formats when updating accounts", async () => {
    const statementImportCsvFormat = {
      hasHeader: false,
      delimitersToGuess: [";"],
      mappings: {
        date: 0,
        amount: { mode: "signed" as const, column: 2 },
        description: 1,
      },
    };

    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Cash",
        type: AccountType.BALANCE,
        statementImportCsvFormat,
      },
    });

    expect(validateAccountInput).toHaveBeenCalledWith(
      expect.objectContaining({ statementImportCsvFormat }),
      [],
    );
    expect(tx.account.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "account-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({ statementImportCsvFormat }),
    });
  });

  it("preserves statement import CSV formats when an update omits the field", async () => {
    const existingStatementImportCsvFormat = {
      hasHeader: true,
      delimitersToGuess: [","],
      columns: ["date", "amount", "description"],
    };
    tx.account.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      statementImportCsvFormat: existingStatementImportCsvFormat,
    });

    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Cash",
        type: AccountType.BALANCE,
      },
    });

    expect(tx.account.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "account-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({
        statementImportCsvFormat: existingStatementImportCsvFormat,
      }),
    });
  });

  it("persists cash flag for currency accounts", async () => {
    tx.account.create.mockResolvedValueOnce({
      id: "account-3",
      name: "Checking",
      type: AccountType.BALANCE,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      isCashAccount: true,
    });

    await createAccount({
      data: {
        accountBookId: "book-1",
        name: "Checking",
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "CHF",
        isCashAccount: true,
      },
    });

    expect(validateAccountInput).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "CHF",
        isCashAccount: true,
      }),
      [],
    );
    expect(tx.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Checking",
          isCashAccount: true,
        }),
      }),
    );
  });

  it("inherits cash status when creating accounts inside cash groups", async () => {
    tx.accountGroup.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      isActive: true,
      isCashAccount: true,
    });

    await createAccount({
      data: {
        accountBookId: "book-1",
        name: "Wallet",
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "CHF",
        groupId: "cash-group",
        isCashAccount: false,
      },
    });

    expect(tx.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupId: "cash-group",
        isCashAccount: true,
      }),
    });
  });

  it("inherits cash status when moving accounts into cash groups", async () => {
    tx.accountGroup.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      isActive: true,
      isCashAccount: true,
    });

    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Cash",
        type: AccountType.BALANCE,
        groupId: "cash-group",
        isCashAccount: false,
      },
    });

    expect(tx.account.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "account-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({
        groupId: "cash-group",
        isCashAccount: true,
      }),
    });
  });

  it("preserves cash status when updating accounts without a cash flag", async () => {
    tx.account.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      statementImportCsvFormat: null,
      isCashAccount: true,
    });

    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Cash renamed",
        type: AccountType.BALANCE,
        groupId: null,
      },
    });

    expect(validateAccountInput).toHaveBeenCalledWith(
      expect.objectContaining({ isCashAccount: true }),
      [],
    );
    expect(tx.account.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "account-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({
        name: "Cash renamed",
        isCashAccount: true,
      }),
    });
  });

  it.each([
    ["unit", { unit: Unit.CRYPTOCURRENCY }],
    ["currency", { currency: "USD" }],
    ["cryptocurrency", { cryptocurrency: "BTC" }],
    ["symbol", { symbol: "AAPL" }],
    ["trade currency", { tradeCurrency: "USD" }],
  ])("rejects changing account %s after creation", async (_label, change) => {
    await expect(
      updateAccount({
        data: {
          id: "account-1",
          accountBookId: "book-1",
          name: "Cash",
          type: AccountType.BALANCE,
          ...change,
        },
      }),
    ).rejects.toThrow("Account unit cannot be changed");

    expect(validateAccountInput).not.toHaveBeenCalled();
    expect(tx.account.update).not.toHaveBeenCalled();
    expect(tx.transaction.update).not.toHaveBeenCalled();
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it.each([-150, 150])(
    "updates an existing opening-balance transaction with signed input %s",
    async (openingBalance) => {
      const type = AccountType.BALANCE;
      tx.account.findUniqueOrThrow.mockResolvedValue({
        type,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        isCashAccount: false,
      });
      tx.account.update.mockResolvedValue({
        id: "account-1",
        name: "Account",
        type,
        unit: Unit.CURRENCY,
        currency: "CHF",
      });
      tx.transaction.findMany.mockResolvedValue([
        {
          id: "tx-open",
          bookings: [
            {
              id: "booking-account",
              accountId: "account-1",
              account: {
                id: "account-1",
                type,
                equityAccountSubtype: null,
              },
            },
            {
              id: "booking-opening",
              accountId: "opening-account",
              account: {
                id: "opening-account",
                type: AccountType.EQUITY,
                equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
              },
            },
          ],
        },
      ]);

      await updateAccount({
        data: {
          id: "account-1",
          accountBookId: "book-1",
          name: "Cash",
          type,
          unit: Unit.CURRENCY,
          currency: "CHF",
          openingBalance,
        },
      });

      expect(tx.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id_accountBookId: {
              id: "tx-open",
              accountBookId: "book-1",
            },
          },
          data: expect.objectContaining({
            bookings: expect.objectContaining({
              update: expect.arrayContaining([
                expect.objectContaining({
                  where: {
                    id_accountBookId: {
                      id: "booking-account",
                      accountBookId: "book-1",
                    },
                  },
                  data: expect.objectContaining({
                    unit: Unit.CURRENCY,
                    currency: "CHF",
                    value: String(openingBalance),
                    sortOrder: 0,
                  }),
                }),
                expect.objectContaining({
                  where: {
                    id_accountBookId: {
                      id: "booking-opening",
                      accountBookId: "book-1",
                    },
                  },
                  data: expect.objectContaining({
                    unit: Unit.CURRENCY,
                    currency: "CHF",
                    value: String(-openingBalance),
                    sortOrder: 1,
                  }),
                }),
              ]),
            }),
          }),
        }),
      );
      expect(tx.transaction.create).not.toHaveBeenCalled();
      expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
        "book-1",
      );
    },
  );

  it.each([AccountType.BALANCE])(
    "deletes %s opening-balance transactions when opening balance is removed",
    async (type) => {
      tx.account.findUniqueOrThrow.mockResolvedValue({
        type,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        isCashAccount: false,
      });
      tx.account.update.mockResolvedValue({
        id: "account-1",
        name: "Account",
        type,
        unit: Unit.CURRENCY,
        currency: "CHF",
      });
      tx.transaction.findMany.mockResolvedValue([
        {
          id: "tx-open",
          bookings: [
            {
              id: "booking-account",
              accountId: "account-1",
              account: {
                id: "account-1",
                type,
                equityAccountSubtype: null,
              },
            },
            {
              id: "booking-opening",
              accountId: "opening-account",
              account: {
                id: "opening-account",
                type: AccountType.EQUITY,
                equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
              },
            },
          ],
        },
      ]);

      await updateAccount({
        data: {
          id: "account-1",
          accountBookId: "book-1",
          name: "Cash",
          type,
          unit: Unit.CURRENCY,
          currency: "CHF",
          openingBalance: null,
        },
      });

      expect(tx.transaction.deleteMany).toHaveBeenCalledWith({
        where: {
          accountBookId: "book-1",
          id: { in: ["tx-open"] },
        },
      });
      expect(tx.transaction.update).not.toHaveBeenCalled();
      expect(tx.transaction.create).not.toHaveBeenCalled();
      expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
        "book-1",
      );
    },
  );

  it("reuses concurrently created opening-balances account on unique conflict", async () => {
    tx.transaction.findMany.mockResolvedValue([]);
    tx.account.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "opening-account-concurrent" });
    tx.account.create.mockRejectedValueOnce({ code: "P2002" });

    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Cash",
        type: AccountType.BALANCE,
        unit: Unit.CURRENCY,
        currency: "CHF",
        openingBalance: 250,
      },
    });

    expect(tx.account.create).toHaveBeenCalledTimes(1);
    expect(tx.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bookings: expect.objectContaining({
            create: expect.arrayContaining([
              expect.objectContaining({
                account: {
                  connect: {
                    id_accountBookId: {
                      id: "opening-account-concurrent",
                      accountBookId: "book-1",
                    },
                  },
                },
                value: "-250",
              }),
            ]),
          }),
        }),
      }),
    );
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });
});

describe("createAccountGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: "book-1" }]);

    tx.accountGroup.findMany.mockResolvedValue([]);
    tx.accountGroup.findUniqueOrThrow.mockResolvedValue({
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      isActive: true,
      isCashAccount: false,
    });
    tx.accountGroup.create.mockResolvedValue({
      id: "group-1",
      accountBookId: "book-1",
      name: "Group",
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      isActive: true,
      isCashAccount: false,
      parentGroupId: null,
      sortOrder: null,
    });
    tx.accountGroup.update.mockResolvedValue({
      id: "group-1",
      accountBookId: "book-1",
      name: "Group",
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      isActive: true,
      isCashAccount: false,
      parentGroupId: null,
      sortOrder: null,
    });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    tx.account.findMany.mockResolvedValue([]);
    tx.account.updateMany.mockResolvedValue({ count: 0 });
    tx.accountGroup.findMany.mockImplementation(async ({ select }) =>
      select.name
        ? []
        : [{ id: "group-1", parentGroupId: null, type: AccountType.BALANCE }],
    );
    tx.accountGroup.update.mockResolvedValue({
      id: "group-1",
      accountBookId: "book-1",
      name: "Group",
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      isActive: true,
      isCashAccount: false,
      parentGroupId: null,
      sortOrder: null,
    });
    tx.accountGroup.updateMany.mockResolvedValue({ count: 0 });
  });

  it("defaults new groups to active when isActive is omitted", async () => {
    await createAccountGroup({
      data: {
        accountBookId: "book-1",
        name: "Group",
        type: AccountType.BALANCE,
      },
    });

    expect(tx.accountGroup.create).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        name: "Group",
        type: AccountType.BALANCE,
        equityAccountSubtype: undefined,
        isActive: true,
        parentGroupId: undefined,
        sortOrder: null,
        isCashAccount: false,
      },
    });
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });

  it("creates archived groups when isActive is false", async () => {
    await createAccountGroup({
      data: {
        accountBookId: "book-1",
        name: "Archived Group",
        type: AccountType.BALANCE,
        parentGroupId: "parent-1",
        sortOrder: 2,
        isActive: false,
      },
    });

    expect(tx.accountGroup.create).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        name: "Archived Group",
        type: AccountType.BALANCE,
        equityAccountSubtype: undefined,
        isActive: false,
        parentGroupId: "parent-1",
        sortOrder: 2,
        isCashAccount: false,
      },
    });
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });

  it("creates root cash groups", async () => {
    await createAccountGroup({
      data: {
        accountBookId: "book-1",
        name: "Cash",
        type: AccountType.BALANCE,
        isCashAccount: true,
      },
    });

    expect(validateAccountGroupInput).toHaveBeenCalledWith(
      expect.objectContaining({ isCashAccount: true }),
      [],
    );
    expect(tx.accountGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Cash",
        isCashAccount: true,
      }),
    });
  });

  it("inherits cash status from parent groups when creating nested groups", async () => {
    tx.accountGroup.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      isActive: true,
      isCashAccount: true,
    });

    await createAccountGroup({
      data: {
        accountBookId: "book-1",
        name: "Wallets",
        type: AccountType.BALANCE,
        parentGroupId: "cash-parent",
        isCashAccount: false,
      },
    });

    expect(tx.accountGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parentGroupId: "cash-parent",
        isCashAccount: true,
      }),
    });
  });

  it("cascades group cash status when updating groups", async () => {
    await updateAccountGroup({
      data: {
        id: "group-1",
        accountBookId: "book-1",
        name: "Cash",
        type: AccountType.BALANCE,
        isCashAccount: true,
      },
    });

    expect(tx.accountGroup.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "group-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({
        name: "Cash",
        isCashAccount: true,
      }),
    });
    expect(tx.accountGroup.updateMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        id: { in: ["group-1"] },
      },
      data: { isCashAccount: true },
    });
    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        groupId: { in: ["group-1"] },
      },
      data: { isCashAccount: true },
    });
  });

  it("preserves and returns group cash status when updating groups without a cash flag", async () => {
    tx.accountGroup.findUniqueOrThrow.mockResolvedValueOnce({
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      isCashAccount: true,
    });
    tx.accountGroup.update.mockImplementationOnce(async ({ data }) => ({
      id: "group-1",
      accountBookId: "book-1",
      type: AccountType.BALANCE,
      equityAccountSubtype: null,
      isActive: true,
      parentGroupId: null,
      sortOrder: null,
      ...data,
    }));

    const result = await updateAccountGroup({
      data: {
        id: "group-1",
        accountBookId: "book-1",
        name: "Cash renamed",
        type: AccountType.BALANCE,
      },
    });

    expect(tx.accountGroup.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: { id: "group-1", accountBookId: "book-1" },
      },
      data: expect.objectContaining({
        name: "Cash renamed",
        isCashAccount: true,
      }),
    });
    expect(tx.accountGroup.updateMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        id: { in: ["group-1"] },
      },
      data: { isCashAccount: true },
    });
    expect(result).toEqual(
      expect.objectContaining({
        name: "Cash renamed",
        isCashAccount: true,
      }),
    );
  });

  it("cascades non-cash status when unmarking groups", async () => {
    await updateAccountGroup({
      data: {
        id: "group-1",
        accountBookId: "book-1",
        name: "Assets",
        type: AccountType.BALANCE,
        isCashAccount: false,
      },
    });

    expect(tx.accountGroup.updateMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        id: { in: ["group-1"] },
      },
      data: { isCashAccount: false },
    });
    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        groupId: { in: ["group-1"] },
      },
      data: { isCashAccount: false },
    });
  });

  it("rejects marking a group cash when its subtree has non-cashable accounts", async () => {
    tx.account.findMany.mockResolvedValueOnce([
      { type: AccountType.BALANCE, unit: Unit.SECURITY },
    ]);

    await expect(
      updateAccountGroup({
        data: {
          id: "group-1",
          accountBookId: "book-1",
          name: "Cash",
          type: AccountType.BALANCE,
          isCashAccount: true,
        },
      }),
    ).rejects.toThrow(
      "Groups included in cash flow must contain only currency accounts",
    );

    expect(tx.accountGroup.update).not.toHaveBeenCalled();
    expect(tx.accountGroup.updateMany).not.toHaveBeenCalled();
  });
});

describe("reorderAccountTreeItems conflict recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: "book-1" }]);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    tx.account.update.mockResolvedValue({ id: "account" });
  });

  it.each([
    { code: "55P03" },
    { driverAdapterError: { cause: { originalCode: "55P03" } } },
  ])("does not automatically retry a busy-book rollback: %j", async (meta) => {
    tx.$queryRaw.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("lock timeout", {
        code: "P2010",
        clientVersion: "test",
        meta,
      }),
    );
    await expect(
      reorderAccountTreeItems({
        data: {
          accountBookId: "book-1",
          updates: [{ id: "a", nodeType: "account", sortOrder: 0 }],
        },
      }),
    ).rejects.toThrow(ACCOUNT_BOOK_BUSY_MESSAGE);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.account.update).not.toHaveBeenCalled();
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it("recreates reorder queries on conflict with authorization and cleanup outside retries", async () => {
    tx.account.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("deadlock", {
        code: "P2034",
        clientVersion: "test",
      }),
    );

    await reorderAccountTreeItems({
      data: {
        accountBookId: "book-1",
        updates: [
          { id: "account-a", nodeType: "account", sortOrder: 1 },
          { id: "account-b", nodeType: "account", sortOrder: 2 },
        ],
      },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    const first = prisma.$transaction.mock.calls[0]![0];
    const second = prisma.$transaction.mock.calls[1]![0];
    expect(second).not.toBe(first);
    expect(tx.account.update).toHaveBeenCalledTimes(4);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledOnce();
    expect(ensureSameOriginRequestFromServerContext).toHaveBeenCalledOnce();
    expect(
      invalidatePeriodBaseDataCacheForAccountBook,
    ).toHaveBeenCalledExactlyOnceWith("book-1");
  });
});

describe("setAccountsAssetClass", () => {
  const input = {
    accountBookId: "book-1",
    accountIds: ["active", "archived"],
    assetClass: AssetClass.EQUITIES,
  };
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAuthorizedForAccountBookId.mockReset().mockResolvedValue(undefined);
    ensureSameOriginRequestFromServerContext.mockReset();
    prisma.$transaction
      .mockReset()
      .mockImplementation(async (callback) => callback(tx));
    tx.$queryRaw.mockResolvedValue([{ id: "book-1" }]);
    tx.account.findMany.mockResolvedValue([
      { id: "active", type: AccountType.BALANCE },
      { id: "archived", type: AccountType.BALANCE },
    ]);
    tx.account.updateMany.mockResolvedValue({ count: 2 });
  });

  it.each([...Object.values(AssetClass), null])(
    "sets %s on active and archived accounts in one book mutation",
    async (assetClass) => {
      await expect(
        setAccountsAssetClass({ data: { ...input, assetClass } }),
      ).resolves.toEqual({ count: 2 });
      expect(ensureSameOriginRequestFromServerContext).toHaveBeenCalledOnce();
      expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
      expect(tx.$queryRaw).toHaveBeenCalledOnce();
      expect(tx.account.findMany).toHaveBeenCalledWith({
        where: { accountBookId: "book-1", id: { in: input.accountIds } },
        select: { id: true, type: true },
      });
      expect(tx.account.updateMany).toHaveBeenCalledExactlyOnceWith({
        where: {
          accountBookId: "book-1",
          id: { in: input.accountIds },
          type: AccountType.BALANCE,
        },
        data: { assetClass },
      });
      expect(
        invalidatePeriodBaseDataCacheForAccountBook,
      ).toHaveBeenCalledExactlyOnceWith("book-1");
    },
  );

  it("deduplicates account IDs before checking the complete target set", async () => {
    await setAccountsAssetClass({
      data: { ...input, accountIds: ["active", "archived", "active"] },
    });
    expect(tx.account.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: input.accountIds } }),
      }),
    );
  });

  it.each([
    [
      "missing or foreign-book account",
      [{ id: "active", type: AccountType.BALANCE }],
    ],
    [
      "category",
      [
        { id: "active", type: AccountType.BALANCE },
        { id: "archived", type: AccountType.EQUITY },
      ],
    ],
  ])("rejects the entire selection for a %s", async (_, accounts) => {
    tx.account.findMany.mockResolvedValue(accounts);
    await expect(setAccountsAssetClass({ data: input })).rejects.toThrow(
      "no longer available",
    );
    expect(tx.account.updateMany).not.toHaveBeenCalled();
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it("does not read or write accounts when authorization fails", async () => {
    ensureAuthorizedForAccountBookId.mockRejectedValueOnce(
      new Error("Forbidden"),
    );
    await expect(setAccountsAssetClass({ data: input })).rejects.toThrow(
      "Forbidden",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.account.updateMany).not.toHaveBeenCalled();
  });

  it("does not invalidate caches after a failed transaction", async () => {
    tx.account.updateMany.mockRejectedValueOnce(new Error("Write failed"));
    await expect(setAccountsAssetClass({ data: input })).rejects.toThrow(
      "Write failed",
    );
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it.each([
    { accountIds: [] },
    { accountIds: [""] },
    { accountIds: [1] },
    { accountIds: "active" },
    { assetClass: undefined },
    { assetClass: "UNCLASSIFIED" },
    { assetClass: "" },
    { assetClass: 1 },
    { accountBookId: "" },
  ])(
    "rejects malformed input %j before opening a transaction",
    async (override) => {
      await expect(
        setAccountsAssetClass({ data: { ...input, ...override } }),
      ).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});

describe("moveAccounts", () => {
  const changes = { includedAccountIds: [], excludedAccountIds: ["active"] };
  const input = {
    accountBookId: "book-1",
    accountIds: ["active", "archived"],
    targetGroupId: "target",
    expectedCashFlowChanges: changes,
  };
  const accounts = [
    {
      id: "active",
      name: "Checking",
      type: AccountType.BALANCE,
      unit: Unit.CURRENCY,
      groupId: "source",
      isActive: true,
      isCashAccount: true,
    },
    {
      id: "archived",
      name: "Closed",
      type: AccountType.BALANCE,
      unit: Unit.CURRENCY,
      groupId: "source",
      isActive: false,
      isCashAccount: false,
    },
  ];
  const group = {
    id: "target",
    name: "Target",
    type: AccountType.BALANCE,
    parentGroupId: null,
    isActive: true,
    isCashAccount: false,
  };
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAuthorizedForAccountBookId.mockReset().mockResolvedValue(undefined);
    ensureSameOriginRequestFromServerContext.mockReset();
    prisma.$transaction
      .mockReset()
      .mockImplementation(async (callback) => callback(tx));
    tx.$queryRaw.mockResolvedValue([{ id: "book-1" }]);
    tx.account.findMany
      .mockReset()
      .mockImplementation(async ({ where }) => (where.id ? accounts : []));
    tx.accountGroup.findUnique.mockReset().mockResolvedValue(group);
    tx.account.updateMany.mockReset().mockResolvedValue({ count: 2 });
  });

  it("authorizes, locks the book, and moves active/archived accounts with inherited cash status", async () => {
    await expect(moveAccounts({ data: input })).resolves.toEqual({ count: 2 });
    expect(ensureSameOriginRequestFromServerContext).toHaveBeenCalledOnce();
    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.accountGroup.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_accountBookId: { id: "target", accountBookId: "book-1" } },
      }),
    );
    expect(tx.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountBookId: "book-1", groupId: "target" },
      }),
    );
    expect(tx.account.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: {
        accountBookId: "book-1",
        id: { in: input.accountIds },
        type: AccountType.BALANCE,
      },
      data: { groupId: "target", isCashAccount: false },
    });
    expect(
      invalidatePeriodBaseDataCacheForAccountBook,
    ).toHaveBeenCalledExactlyOnceWith("book-1");
  });

  it("preserves each account's cash status when moving to No Group", async () => {
    await moveAccounts({
      data: {
        ...input,
        targetGroupId: null,
        expectedCashFlowChanges: {
          includedAccountIds: [],
          excludedAccountIds: [],
        },
      },
    });
    expect(tx.accountGroup.findUnique).not.toHaveBeenCalled();
    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        id: { in: ["active"] },
        type: AccountType.BALANCE,
      },
      data: { groupId: null, isCashAccount: true },
    });
    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        id: { in: ["archived"] },
        type: AccountType.BALANCE,
      },
      data: { groupId: null, isCashAccount: false },
    });
  });

  it("deduplicates IDs and supports currency accounts entering cash flow", async () => {
    tx.accountGroup.findUnique.mockResolvedValue({
      ...group,
      isCashAccount: true,
    });
    await moveAccounts({
      data: {
        ...input,
        accountIds: [...input.accountIds, "active"],
        expectedCashFlowChanges: {
          includedAccountIds: ["archived"],
          excludedAccountIds: [],
        },
      },
    });
    expect(tx.account.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { groupId: "target", isCashAccount: true },
      }),
    );
  });

  it("skips accounts already in the target and avoids writes/cache invalidation for a no-op", async () => {
    tx.account.findMany.mockResolvedValueOnce(
      accounts.map((account) => ({ ...account, groupId: "target" })),
    );
    await expect(
      moveAccounts({
        data: {
          ...input,
          expectedCashFlowChanges: {
            includedAccountIds: [],
            excludedAccountIds: [],
          },
        },
      }),
    ).resolves.toEqual({ count: 0 });
    expect(tx.account.updateMany).not.toHaveBeenCalled();
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it.each([
    ["missing/foreign account", [accounts[0]]],
    ["category", [accounts[0], { ...accounts[1], type: AccountType.EQUITY }]],
  ])("rejects a %s before any write", async (_, selection) => {
    tx.account.findMany.mockResolvedValueOnce(selection);
    await expect(moveAccounts({ data: input })).rejects.toThrow(
      "no longer available",
    );
    expect(tx.account.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["missing/foreign group", null, "no longer available"],
    ["category group", { ...group, type: AccountType.EQUITY }, "account group"],
    ["archived group", { ...group, isActive: false }, "Active accounts"],
  ])("rejects an incompatible %s", async (_, target, message) => {
    tx.accountGroup.findUnique.mockResolvedValue(target);
    await expect(moveAccounts({ data: input })).rejects.toThrow(message);
    expect(tx.account.updateMany).not.toHaveBeenCalled();
  });

  it("allows archived accounts in an archived group", async () => {
    tx.accountGroup.findUnique.mockResolvedValue({ ...group, isActive: false });
    tx.account.findMany.mockResolvedValueOnce(
      accounts.map((account) => ({ ...account, isActive: false })),
    );
    await expect(moveAccounts({ data: input })).resolves.toEqual({ count: 2 });
  });

  it("rejects a cash-flow group for a security account", async () => {
    tx.accountGroup.findUnique.mockResolvedValue({
      ...group,
      isCashAccount: true,
    });
    tx.account.findMany.mockResolvedValueOnce([
      accounts[0],
      { ...accounts[1], unit: Unit.SECURITY },
    ]);
    await expect(moveAccounts({ data: input })).rejects.toThrow(
      "only currency accounts",
    );
    expect(tx.account.updateMany).not.toHaveBeenCalled();
  });

  it.each(["destination", "selection"])(
    "rejects case-insensitive name conflicts in the %s",
    async (kind) => {
      tx.account.findMany.mockResolvedValueOnce(
        kind === "selection"
          ? [accounts[0], { ...accounts[1], name: "CHECKING" }]
          : accounts,
      );
      tx.account.findMany.mockResolvedValueOnce(
        kind === "destination" ? [{ id: "conflict", name: "checking" }] : [],
      );
      await expect(moveAccounts({ data: input })).rejects.toThrow("same name");
      expect(tx.account.updateMany).not.toHaveBeenCalled();
    },
  );

  it("requires the actual cash-flow changes to match the reviewed preview", async () => {
    tx.accountGroup.findUnique.mockResolvedValue({
      ...group,
      isCashAccount: true,
    });
    await expect(moveAccounts({ data: input })).rejects.toThrow(
      "has changed since this move was reviewed",
    );
    expect(tx.account.updateMany).not.toHaveBeenCalled();
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it("does not read or write accounts when authorization fails", async () => {
    ensureAuthorizedForAccountBookId.mockRejectedValueOnce(
      new Error("Forbidden"),
    );
    await expect(moveAccounts({ data: input })).rejects.toThrow("Forbidden");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not invalidate cache when a transactional write fails", async () => {
    tx.account.updateMany.mockRejectedValueOnce(new Error("Write failed"));
    await expect(moveAccounts({ data: input })).rejects.toThrow("Write failed");
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it.each([
    { accountIds: [] },
    { accountIds: [1] },
    { targetGroupId: undefined },
    { targetGroupId: "" },
    { expectedCashFlowChanges: undefined },
    {
      expectedCashFlowChanges: {
        includedAccountIds: "invalid",
        excludedAccountIds: [],
      },
    },
  ])("rejects malformed input %j before a transaction", async (override) => {
    await expect(
      moveAccounts({ data: { ...input, ...override } }),
    ).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
