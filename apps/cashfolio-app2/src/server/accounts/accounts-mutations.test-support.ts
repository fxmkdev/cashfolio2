import { vi } from "vitest";

import { AccountType, Unit } from "../../.prisma-client/enums";

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
  classificationNode: {
    findUnique: vi.fn().mockResolvedValue({ id: "class" }),
  },
  accountClassification: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
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

vi.mock("../../shared/accounts/account-validation", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../shared/accounts/account-validation")
  >()),
  validateAccountInput,
  validateAccountGroupInput,
}));

vi.mock("../../prisma.server", () => ({
  prisma,
}));

vi.mock("../period/cache/period-base-data-cache.server", () => ({
  invalidatePeriodBaseDataCacheForAccountBook,
}));

vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));
const resetAccountBoundary = () => vi.clearAllMocks();
const resetAccountMutation = () => {
  vi.clearAllMocks();
  tx.classificationNode.findUnique.mockResolvedValue({ id: "class" });
  tx.accountClassification.deleteMany.mockResolvedValue({ count: 0 });
  tx.accountClassification.createMany.mockResolvedValue({ count: 1 });
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
};
const resetAccountGroup = () => {
  vi.clearAllMocks();
  tx.classificationNode.findUnique.mockResolvedValue({ id: "class" });
  tx.accountClassification.deleteMany.mockResolvedValue({ count: 0 });
  tx.accountClassification.createMany.mockResolvedValue({ count: 1 });
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
};
export {
  archiveAccount,
  archiveAccountGroup,
  createAccount,
  createAccountGroup,
  deleteAccount,
  deleteAccountGroup,
  ensureAuthorizedForAccountBookId,
  ensureSameOriginRequestFromServerContext,
  invalidatePeriodBaseDataCacheForAccountBook,
  prisma,
  resetAccountBoundary,
  resetAccountGroup,
  resetAccountMutation,
  setAccountsAssetClass,
  setAccountsTrackingMethod,
  tx,
  unarchiveAccount,
  unarchiveAccountGroup,
  updateAccount,
  updateAccountGroup,
  validateAccountGroupInput,
  validateAccountInput,
};

// Register mocks before importing the tested modules and their dependencies.
const {
  setAccountsAssetClass,
  setAccountsTrackingMethod,
  archiveAccount,
  archiveAccountGroup,
  createAccount,
  createAccountGroup,
  deleteAccount,
  deleteAccountGroup,
  unarchiveAccount,
  unarchiveAccountGroup,
  updateAccount,
  updateAccountGroup,
} = await import("./accounts-mutations");
