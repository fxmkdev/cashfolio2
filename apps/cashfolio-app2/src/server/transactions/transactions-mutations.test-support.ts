import { vi } from "vitest";

import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";

import type {
  CreateSimpleTransactionInput,
  CreateTransactionInput,
} from "./transactions-types";

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

const invalidatePeriodBaseDataCacheForAccountBook = vi.hoisted(() => vi.fn());

const prisma = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  booking: {
    count: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  transaction: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  account: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("../../security/same-origin.server", () => ({
  ensureSameOriginRequestFromServerContext,
}));

vi.mock("../../prisma.server", () => ({
  prisma,
}));

vi.mock("../period/cache/period-base-data-cache.server", () => ({
  invalidatePeriodBaseDataCacheForAccountBook,
}));

const BASE_DATE = "2026-01-12T00:00:00.000Z";

const FIXED_SYSTEM_TIME = new Date("2026-02-01T12:00:00.000Z");

function createAssetAccount(id: string) {
  return {
    id,
    type: AccountType.BALANCE,
    equityAccountSubtype: null,
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    isActive: true,
  };
}

function createCounterEquityAccount(
  subtype: EquityAccountSubtype | null = EquityAccountSubtype.INCOME,
) {
  return {
    id: "counter-1",
    type: AccountType.EQUITY,
    equityAccountSubtype: subtype,
    unit: null,
    currency: null,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    isActive: true,
  };
}

function createSimpleInput(
  overrides: Partial<CreateSimpleTransactionInput> = {},
): CreateSimpleTransactionInput {
  return {
    accountBookId: "book-1",
    accountId: "asset-1",
    counterAccountId: "counter-1",
    description: "Simple transfer",
    amount: 120,
    direction: "DEBIT",
    date: BASE_DATE,
    ...overrides,
  };
}

function createTransactionInput(
  overrides: Partial<CreateTransactionInput> = {},
): CreateTransactionInput {
  return {
    accountBookId: "book-1",
    description: "Transaction",
    bookings: [
      {
        date: BASE_DATE,
        accountId: "asset-1",
        description: "",
        unit: Unit.CURRENCY,
        currency: "CHF",
        value: 50,
      },
      {
        date: BASE_DATE,
        accountId: "counter-1",
        description: "",
        unit: Unit.CURRENCY,
        currency: "CHF",
        value: -50,
      },
    ],
    ...overrides,
  };
}

function createBookingType(
  id: string,
  type: AccountType,
  equityAccountSubtype: EquityAccountSubtype | null,
) {
  return {
    id,
    account: {
      type,
      equityAccountSubtype,
    },
  };
}

vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));
const resetTransactionBoundary = () => vi.clearAllMocks();
const resetTransactionMutation = () => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_SYSTEM_TIME);
  vi.clearAllMocks();

  prisma.booking.count.mockResolvedValue(0);
  prisma.booking.findUnique.mockResolvedValue({
    id: "booking-1",
    date: new Date(BASE_DATE),
    accountId: "asset-1",
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    value: 120,
    transactionId: "tx-1",
  });
  prisma.booking.findMany.mockResolvedValue([
    createBookingType("booking-1", AccountType.BALANCE, null),
    createBookingType("booking-2", AccountType.BALANCE, null),
  ]);
  prisma.booking.update.mockResolvedValue({ id: "booking-1" });
  prisma.booking.deleteMany.mockResolvedValue({ count: 2 });
  prisma.transaction.create.mockResolvedValue({ id: "tx-created" });
  prisma.transaction.update.mockResolvedValue({ id: "tx-updated" });
  prisma.transaction.delete.mockResolvedValue({ id: "tx-deleted" });
  prisma.account.findMany.mockResolvedValue([
    createAssetAccount("asset-1"),
    createCounterEquityAccount(),
  ]);
  prisma.account.findUnique.mockResolvedValue({
    id: "target-1",
    isActive: true,
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    type: AccountType.BALANCE,
    equityAccountSubtype: null,
  });
  prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
    startDate: new Date("2026-01-01T00:00:00.000Z"),
  });
  prisma.$queryRaw.mockResolvedValue([{ id: "book-1" }]);
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
};
const cleanupTransactionMutation = () => {
  vi.useRealTimers();
};
export {
  BASE_DATE,
  cleanupTransactionMutation,
  createAssetAccount,
  createBookingType,
  createCounterEquityAccount,
  createSimpleInput,
  createSimpleTransaction,
  createTransaction,
  createTransactionInput,
  createTransactions,
  deleteTransaction,
  ensureAuthorizedForAccountBookId,
  ensureSameOriginRequestFromServerContext,
  invalidatePeriodBaseDataCacheForAccountBook,
  prisma,
  rebookBooking,
  resetTransactionBoundary,
  resetTransactionMutation,
  updateTransaction,
};

// Register mocks before importing the tested modules and their dependencies.
const {
  createSimpleTransaction,
  createTransaction,
  createTransactions,
  deleteTransaction,
  rebookBooking,
  updateTransaction,
} = await import("./transactions-mutations");
