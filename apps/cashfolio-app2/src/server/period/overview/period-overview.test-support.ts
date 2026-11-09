import { vi } from "vitest";

import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../../.prisma-client/enums";

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

const convertBookingValueToReference = vi.hoisted(() => vi.fn());

const getUnitToReferenceExchangeRate = vi.hoisted(() => vi.fn());

const prisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
  accountGroup: {
    findMany: vi.fn(),
  },
  account: {
    findMany: vi.fn(),
  },
  booking: {
    groupBy: vi.fn(),
    findMany: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
  },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../../../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("../../../prisma.server", () => ({
  prisma,
}));

vi.mock("../period-conversion.server", () => ({
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
}));

function transactionFilterIncludes(
  filter: unknown,
  transactionId: string,
): boolean {
  if (filter === transactionId) {
    return true;
  }
  if (
    typeof filter === "object" &&
    filter != null &&
    "in" in filter &&
    Array.isArray(filter.in)
  ) {
    return filter.in.includes(transactionId);
  }
  return false;
}

function isEquityBookingQuery(args: unknown): boolean {
  if (
    typeof args === "object" &&
    args !== null &&
    "where" in args &&
    typeof args.where === "object" &&
    args.where !== null &&
    "accountId" in args.where
  ) {
    const accountIdFilter = args.where.accountId;
    const dateFilter = "date" in args.where ? args.where.date : undefined;

    return (
      typeof accountIdFilter === "object" &&
      accountIdFilter !== null &&
      "in" in accountIdFilter &&
      Array.isArray(accountIdFilter.in) &&
      "accountBookId" in args.where &&
      typeof dateFilter === "object" &&
      dateFilter !== null &&
      "gte" in dateFilter &&
      "lt" in dateFilter
    );
  }

  return (
    typeof args === "object" &&
    args !== null &&
    "where" in args &&
    typeof args.where === "object" &&
    args.where !== null &&
    "account" in args.where &&
    typeof args.where.account === "object" &&
    args.where.account !== null &&
    "type" in args.where.account &&
    args.where.account.type === AccountType.EQUITY
  );
}

function isTransferClearingBookingQuery(args: unknown): boolean {
  if (typeof args !== "object" || args === null || !("where" in args)) {
    return false;
  }

  const where = args.where;
  if (typeof where !== "object" || where === null) {
    return false;
  }
  if (!("date" in where)) {
    return false;
  }
  const date = where.date;
  if (
    typeof date !== "object" ||
    date === null ||
    !("lt" in date) ||
    !(date.lt instanceof Date)
  ) {
    return false;
  }

  if (!("account" in where)) {
    return false;
  }
  const account = where.account;
  if (typeof account !== "object" || account === null || !("OR" in account)) {
    return false;
  }
  const accountOr = account.OR;
  if (!Array.isArray(accountOr)) {
    return false;
  }
  const assetLiabilityBranch = accountOr.find(
    (branch) =>
      typeof branch === "object" &&
      branch !== null &&
      "type" in branch &&
      typeof branch.type === "object" &&
      branch.type !== null &&
      "in" in branch.type &&
      Array.isArray(branch.type.in) &&
      branch.type.in.includes(AccountType.BALANCE) &&
      branch.type.in.includes(AccountType.BALANCE),
  );
  const equityBranch = accountOr.find(
    (branch) =>
      typeof branch === "object" &&
      branch !== null &&
      "type" in branch &&
      branch.type === AccountType.EQUITY &&
      "equityAccountSubtype" in branch &&
      typeof branch.equityAccountSubtype === "object" &&
      branch.equityAccountSubtype !== null &&
      "in" in branch.equityAccountSubtype &&
      Array.isArray(branch.equityAccountSubtype.in) &&
      branch.equityAccountSubtype.in.includes(EquityAccountSubtype.INCOME) &&
      branch.equityAccountSubtype.in.includes(EquityAccountSubtype.EXPENSE),
  );
  if (!assetLiabilityBranch || !equityBranch) {
    return false;
  }

  if (!("transaction" in where)) {
    return false;
  }
  const transaction = where.transaction;
  if (
    typeof transaction !== "object" ||
    transaction === null ||
    !("bookings" in transaction)
  ) {
    return false;
  }

  return true;
}

type BreakdownHierarchyTestNode = {
  id: string;
  label: string;
  amount: number;
  children: BreakdownHierarchyTestNode[];
};

function findBreakdownNodeById(
  nodes: BreakdownHierarchyTestNode[],
  targetId: string,
): BreakdownHierarchyTestNode | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node;
    }

    const inChildren = findBreakdownNodeById(node.children, targetId);
    if (inChildren) {
      return inChildren;
    }
  }
  return null;
}
const resetOverview = () => {
  vi.clearAllMocks();
  prisma.$executeRaw.mockResolvedValue(0);
  prisma.$transaction.mockImplementation(async (load) => load(prisma));
  vi.useFakeTimers();

  prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
    classificationSchemes: [],
    referenceCurrency: "CHF",
    startDate: new Date("2026-01-08T00:00:00.000Z"),
  });
  prisma.accountGroup.findMany.mockResolvedValue([]);
  prisma.account.findMany.mockResolvedValue([
    {
      id: "asset-chf",
      name: "Cash",
      groupId: null,
      type: AccountType.BALANCE,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    },
  ]);
  prisma.booking.findMany.mockImplementation((args) => {
    if (isEquityBookingQuery(args)) {
      return Promise.resolve([]);
    }
    if (isTransferClearingBookingQuery(args)) {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  });
  prisma.booking.groupBy.mockResolvedValue([]);
  prisma.transaction.findMany.mockResolvedValue([]);

  convertBookingValueToReference.mockImplementation(async ({ value }) => value);
  getUnitToReferenceExchangeRate.mockResolvedValue(1);
};
const cleanupOverview = () => {
  vi.useRealTimers();
};
export {
  cleanupOverview,
  convertBookingValueToReference,
  DEFAULT_PERIOD_VALUE,
  ensureAuthorizedForAccountBookId,
  findBreakdownNodeById,
  getPeriodOverview,
  getUnitToReferenceExchangeRate,
  isEquityBookingQuery,
  isTransferClearingBookingQuery,
  prisma,
  resetOverview,
  transactionFilterIncludes,
};

// Register mocks before importing the tested modules and their dependencies.
const { DEFAULT_PERIOD_VALUE, getPeriodOverview } =
  await import("../../period");
