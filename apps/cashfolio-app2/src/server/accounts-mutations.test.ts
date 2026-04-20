import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";

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

const tx = vi.hoisted(() => ({
  account: {
    update: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
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

const prisma = vi.hoisted(() => ({
  account: {
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("../security/same-origin.server", () => ({
  ensureSameOriginRequestFromServerContext,
}));

vi.mock("../shared/account-validation", () => ({
  validateAccountInput,
  validateAccountGroupInput,
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

import { updateAccount } from "./accounts-mutations";

describe("updateAccount opening balance management", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.account.findMany.mockResolvedValue([]);
    prisma.account.findUniqueOrThrow.mockResolvedValue({
      type: AccountType.ASSET,
      equityAccountSubtype: null,
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
    });
    tx.accountBook.findUniqueOrThrow.mockResolvedValue({
      startDate: new Date("2026-01-10T00:00:00.000Z"),
    });
    tx.transaction.create.mockResolvedValue({ id: "tx-created" });
    tx.transaction.update.mockResolvedValue({ id: "tx-open" });
    tx.transaction.deleteMany.mockResolvedValue({ count: 0 });
    tx.booking.deleteMany.mockResolvedValue({ count: 0 });
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
  });
});
