import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";

const createServerFn = vi.hoisted(() =>
  vi.fn(() => {
    let validate: ((data: unknown) => unknown) | undefined;
    const chain = {
      inputValidator: vi.fn((validator: (data: unknown) => unknown) => {
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

vi.mock("../../shared/account-validation", () => ({
  validateAccountInput,
  validateAccountGroupInput,
}));

vi.mock("../../prisma.server", () => ({
  prisma,
}));

vi.mock("../period/period-base-data-cache", () => ({
  invalidatePeriodBaseDataCacheForAccountBook,
}));

import {
  createAccount,
  createAccountGroup,
  updateAccount,
  updateAccountGroup,
} from "./accounts-mutations";

describe("updateAccount opening balance management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: "book-1" }]);

    tx.account.findMany.mockResolvedValue([]);
    tx.account.findUniqueOrThrow.mockResolvedValue({
      type: AccountType.ASSET,
      equityAccountSubtype: null,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      isCashAccount: false,
    });
    tx.accountGroup.findUniqueOrThrow.mockResolvedValue({
      isCashAccount: false,
    });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    tx.account.update.mockResolvedValue({
      id: "account-1",
      name: "Cash",
      type: AccountType.ASSET,
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
      type: AccountType.ASSET,
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

  it("updates editable account fields without rewriting unit identity fields", async () => {
    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Cash renamed",
        type: AccountType.ASSET,
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

  it("ignores stale submitted unit identity fields when updating unitless equity accounts", async () => {
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
      type: AccountType.ASSET,
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
        type: AccountType.ASSET,
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
        type: AccountType.ASSET,
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
      type: AccountType.ASSET,
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
        type: AccountType.ASSET,
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

  it("persists cash flag for currency asset accounts", async () => {
    tx.account.create.mockResolvedValueOnce({
      id: "account-3",
      name: "Checking",
      type: AccountType.ASSET,
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
        type: AccountType.ASSET,
        unit: Unit.CURRENCY,
        currency: "CHF",
        isCashAccount: true,
      },
    });

    expect(validateAccountInput).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AccountType.ASSET,
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
      isCashAccount: true,
    });

    await createAccount({
      data: {
        accountBookId: "book-1",
        name: "Wallet",
        type: AccountType.ASSET,
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
      isCashAccount: true,
    });

    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Cash",
        type: AccountType.ASSET,
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
      type: AccountType.ASSET,
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
        type: AccountType.ASSET,
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
          type: AccountType.ASSET,
          ...change,
        },
      }),
    ).rejects.toThrow("Account unit cannot be changed");

    expect(validateAccountInput).not.toHaveBeenCalled();
    expect(tx.account.update).not.toHaveBeenCalled();
    expect(tx.transaction.update).not.toHaveBeenCalled();
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it("updates the existing opening-balance transaction instead of creating a new one", async () => {
    tx.transaction.findMany.mockResolvedValue([
      {
        id: "tx-open",
        bookings: [
          {
            id: "booking-account",
            accountId: "account-1",
            account: {
              id: "account-1",
              type: AccountType.ASSET,
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
        type: AccountType.ASSET,
        unit: Unit.CURRENCY,
        currency: "CHF",
        openingBalance: 150,
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
                  value: 150,
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
                  value: -150,
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
  });

  it("deletes opening-balance transactions when opening balance is removed", async () => {
    tx.transaction.findMany.mockResolvedValue([
      {
        id: "tx-open",
        bookings: [
          {
            id: "booking-account",
            accountId: "account-1",
            account: {
              id: "account-1",
              type: AccountType.ASSET,
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
        type: AccountType.ASSET,
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
  });

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
        type: AccountType.ASSET,
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
                value: -250,
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
      type: AccountType.ASSET,
      equityAccountSubtype: null,
      isCashAccount: false,
    });
    tx.accountGroup.create.mockResolvedValue({
      id: "group-1",
      accountBookId: "book-1",
      name: "Group",
      type: AccountType.ASSET,
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
      type: AccountType.ASSET,
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
        : [{ id: "group-1", parentGroupId: null, type: AccountType.ASSET }],
    );
    tx.accountGroup.update.mockResolvedValue({
      id: "group-1",
      accountBookId: "book-1",
      name: "Group",
      type: AccountType.ASSET,
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
        type: AccountType.ASSET,
      },
    });

    expect(tx.accountGroup.create).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        name: "Group",
        type: AccountType.ASSET,
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
        type: AccountType.ASSET,
        parentGroupId: "parent-1",
        sortOrder: 2,
        isActive: false,
      },
    });

    expect(tx.accountGroup.create).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        name: "Archived Group",
        type: AccountType.ASSET,
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
        type: AccountType.ASSET,
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
      isCashAccount: true,
    });

    await createAccountGroup({
      data: {
        accountBookId: "book-1",
        name: "Wallets",
        type: AccountType.ASSET,
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
        type: AccountType.ASSET,
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
      type: AccountType.ASSET,
      equityAccountSubtype: null,
      isCashAccount: true,
    });
    tx.accountGroup.update.mockImplementationOnce(async ({ data }) => ({
      id: "group-1",
      accountBookId: "book-1",
      type: AccountType.ASSET,
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
        type: AccountType.ASSET,
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
        type: AccountType.ASSET,
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
      { type: AccountType.ASSET, unit: Unit.SECURITY },
    ]);

    await expect(
      updateAccountGroup({
        data: {
          id: "group-1",
          accountBookId: "book-1",
          name: "Cash",
          type: AccountType.ASSET,
          isCashAccount: true,
        },
      }),
    ).rejects.toThrow(
      "Cash account groups must contain only currency asset accounts",
    );

    expect(tx.accountGroup.update).not.toHaveBeenCalled();
    expect(tx.accountGroup.updateMany).not.toHaveBeenCalled();
  });
});
