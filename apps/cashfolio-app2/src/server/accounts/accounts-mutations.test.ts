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
    count: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

const prisma = vi.hoisted(() => ({
  account: {
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  accountGroup: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  booking: {
    count: vi.fn(),
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

import { createAccountGroup, updateAccount } from "./accounts-mutations";

describe("updateAccount opening balance management", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.account.findMany.mockResolvedValue([]);
    prisma.account.findUniqueOrThrow.mockResolvedValue({
      type: AccountType.ASSET,
      equityAccountSubtype: null,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
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
    tx.account.findFirst.mockResolvedValue(null);
    tx.account.create.mockResolvedValue({ id: "opening-account" });
    tx.accountBook.findUniqueOrThrow.mockResolvedValue({
      startDate: new Date("2026-01-10T00:00:00.000Z"),
    });
    tx.transaction.create.mockResolvedValue({ id: "tx-created" });
    tx.transaction.update.mockResolvedValue({ id: "tx-open" });
    tx.transaction.deleteMany.mockResolvedValue({ count: 0 });
    tx.booking.count.mockResolvedValue(0);
    tx.booking.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("rejects changing currency when the account has bookings", async () => {
    tx.booking.count.mockResolvedValue(1);

    await expect(
      updateAccount({
        data: {
          id: "account-1",
          accountBookId: "book-1",
          name: "Cash",
          type: AccountType.ASSET,
          unit: Unit.CURRENCY,
          currency: "EUR",
          openingBalance: 150,
        },
      }),
    ).rejects.toThrow(
      "Account unit cannot be changed after bookings have been created.",
    );

    expect(tx.booking.count).toHaveBeenCalledWith({
      where: {
        accountId: "account-1",
        accountBookId: "book-1",
      },
    });
    expect(tx.account.update).not.toHaveBeenCalled();
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it("rejects changing unit type when the account has bookings", async () => {
    tx.booking.count.mockResolvedValue(1);

    await expect(
      updateAccount({
        data: {
          id: "account-1",
          accountBookId: "book-1",
          name: "Cash",
          type: AccountType.ASSET,
          unit: Unit.CRYPTOCURRENCY,
          cryptocurrency: "BTC",
          openingBalance: 150,
        },
      }),
    ).rejects.toThrow(
      "Account unit cannot be changed after bookings have been created.",
    );

    expect(tx.account.update).not.toHaveBeenCalled();
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it("allows changing unit identity when the account has no bookings", async () => {
    tx.booking.count.mockResolvedValue(0);
    tx.transaction.findMany.mockResolvedValue([]);

    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Cash",
        type: AccountType.ASSET,
        unit: Unit.CURRENCY,
        currency: "EUR",
        openingBalance: null,
      },
    });

    expect(tx.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unit: Unit.CURRENCY,
          currency: "EUR",
        }),
      }),
    );
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });

  it("allows non-unit edits when the account has bookings", async () => {
    tx.booking.count.mockResolvedValue(1);
    tx.transaction.findMany.mockResolvedValue([]);

    await updateAccount({
      data: {
        id: "account-1",
        accountBookId: "book-1",
        name: "Renamed Cash",
        type: AccountType.ASSET,
        groupId: "group-1",
        sortOrder: 3,
        unit: Unit.CURRENCY,
        currency: "CHF",
        openingBalance: null,
      },
    });

    expect(tx.booking.count).not.toHaveBeenCalled();
    expect(tx.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Renamed Cash",
          groupId: "group-1",
          sortOrder: 3,
          unit: Unit.CURRENCY,
          currency: "CHF",
        }),
      }),
    );
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
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

    prisma.accountGroup.findMany.mockResolvedValue([]);
    prisma.accountGroup.create.mockResolvedValue({
      id: "group-1",
      accountBookId: "book-1",
      name: "Group",
      type: AccountType.ASSET,
      equityAccountSubtype: null,
      isActive: true,
      parentGroupId: null,
      sortOrder: null,
    });
  });

  it("defaults new groups to active when isActive is omitted", async () => {
    await createAccountGroup({
      data: {
        accountBookId: "book-1",
        name: "Group",
        type: AccountType.ASSET,
      },
    });

    expect(prisma.accountGroup.create).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        name: "Group",
        type: AccountType.ASSET,
        equityAccountSubtype: undefined,
        isActive: true,
        parentGroupId: undefined,
        sortOrder: null,
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

    expect(prisma.accountGroup.create).toHaveBeenCalledWith({
      data: {
        accountBookId: "book-1",
        name: "Archived Group",
        type: AccountType.ASSET,
        equityAccountSubtype: undefined,
        isActive: false,
        parentGroupId: "parent-1",
        sortOrder: 2,
      },
    });
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });
});
