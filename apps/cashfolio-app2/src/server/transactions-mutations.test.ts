import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "../shared/opening-balances";
import { GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE } from "../shared/gain-loss-transaction-invariant";

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
const invalidatePeriodBaseDataCacheForAccountBook = vi.hoisted(() => vi.fn());

const prisma = vi.hoisted(() => ({
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

vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("../security/same-origin.server", () => ({
  ensureSameOriginRequestFromServerContext,
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));
vi.mock("./period-base-data-cache", () => ({
  invalidatePeriodBaseDataCacheForAccountBook,
}));

import {
  createSimpleTransaction,
  createTransaction,
  deleteTransaction,
  rebookBooking,
  updateTransaction,
} from "./transactions-mutations";
import type {
  CreateSimpleTransactionInput,
  CreateTransactionInput,
} from "./transactions-types";

const BASE_DATE = "2026-01-12T00:00:00.000Z";
const FIXED_SYSTEM_TIME = new Date("2026-02-01T12:00:00.000Z");

function createAssetAccount(id: string) {
  return {
    id,
    type: AccountType.ASSET,
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

describe("transactions mutations", () => {
  beforeEach(() => {
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
      createBookingType("booking-1", AccountType.ASSET, null),
      createBookingType("booking-2", AccountType.LIABILITY, null),
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
      type: AccountType.LIABILITY,
      equityAccountSubtype: null,
    });
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.$transaction.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("blocks deleting opening-balance transactions", async () => {
    prisma.booking.count.mockResolvedValueOnce(1);

    await expect(
      deleteTransaction({
        data: { accountBookId: "book-1", transactionId: "tx-opening" },
      }),
    ).rejects.toThrow(OPENING_BALANCES_MANAGEMENT_MESSAGE);

    expect(prisma.transaction.delete).not.toHaveBeenCalled();
  });

  it("deletes non-opening-balance transactions", async () => {
    await deleteTransaction({
      data: { accountBookId: "book-1", transactionId: "tx-regular" },
    });

    expect(ensureSameOriginRequestFromServerContext).toHaveBeenCalledTimes(1);
    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
    expect(prisma.transaction.delete).toHaveBeenCalledWith({
      where: {
        id_accountBookId: {
          id: "tx-regular",
          accountBookId: "book-1",
        },
      },
    });
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });

  it("rejects simple transactions with invalid amount", async () => {
    await expect(
      createSimpleTransaction({
        data: createSimpleInput({ amount: 0 }),
      }),
    ).rejects.toThrow("Amount must be greater than zero.");
  });

  it("rejects simple transactions that reuse the same account", async () => {
    await expect(
      createSimpleTransaction({
        data: createSimpleInput({ counterAccountId: "asset-1" }),
      }),
    ).rejects.toThrow(
      "Counter account must be different from the current account.",
    );
  });

  it("rejects missing current account in simple transactions", async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      createCounterEquityAccount(),
    ]);

    await expect(
      createSimpleTransaction({
        data: createSimpleInput(),
      }),
    ).rejects.toThrow("Current account was not found.");
  });

  it("rejects inactive counter account for simple transactions", async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      createAssetAccount("asset-1"),
      {
        ...createCounterEquityAccount(),
        isActive: false,
      },
    ]);

    await expect(
      createSimpleTransaction({
        data: createSimpleInput(),
      }),
    ).rejects.toThrow("Counter account must be active.");
  });

  it("rejects unit mismatches between current and counter asset/liability accounts", async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      createAssetAccount("asset-1"),
      {
        id: "counter-1",
        type: AccountType.LIABILITY,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "USD",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        isActive: true,
      },
    ]);

    await expect(
      createSimpleTransaction({
        data: createSimpleInput(),
      }),
    ).rejects.toThrow(
      "Asset and liability accounts must use the same unit as the current account.",
    );
  });

  it("rejects opening-balance accounts as simple-transaction targets", async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      createAssetAccount("asset-1"),
      createCounterEquityAccount(EquityAccountSubtype.OPENING_BALANCES),
    ]);

    await expect(
      createSimpleTransaction({
        data: createSimpleInput(),
      }),
    ).rejects.toThrow(OPENING_BALANCES_MANAGEMENT_MESSAGE);
  });

  it("rejects simple transactions before account-book start date", async () => {
    prisma.accountBook.findUniqueOrThrow.mockResolvedValueOnce({
      startDate: new Date("2026-01-20T00:00:00.000Z"),
    });

    await expect(
      createSimpleTransaction({
        data: createSimpleInput({ date: "2026-01-12T00:00:00.000Z" }),
      }),
    ).rejects.toThrow(
      "Date cannot be before account book start date (2026-01-20).",
    );
  });

  it("creates a simple transaction when inputs are valid", async () => {
    const created = { id: "tx-simple" };
    prisma.transaction.create.mockResolvedValueOnce(created);

    await expect(
      createSimpleTransaction({
        data: createSimpleInput(),
      }),
    ).resolves.toEqual(created);

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountBookId: "book-1",
          description: "Simple transfer",
        }),
      }),
    );
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });

  it("creates full transactions from validated booking payloads", async () => {
    const created = { id: "tx-full" };
    prisma.transaction.create.mockResolvedValueOnce(created);

    await expect(
      createTransaction({
        data: createTransactionInput(),
      }),
    ).resolves.toEqual(created);

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountBookId: "book-1",
          description: "Transaction",
        }),
      }),
    );
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });

  it("rejects create transaction when gain/loss booking is not simple", async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      {
        id: "gain-loss-1",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
      },
      {
        id: "asset-1",
        type: AccountType.ASSET,
        equityAccountSubtype: null,
      },
      {
        id: "liability-1",
        type: AccountType.LIABILITY,
        equityAccountSubtype: null,
      },
    ]);

    await expect(
      createTransaction({
        data: createTransactionInput({
          bookings: [
            {
              date: BASE_DATE,
              accountId: "gain-loss-1",
              description: "",
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: -100,
            },
            {
              date: BASE_DATE,
              accountId: "asset-1",
              description: "",
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: 40,
            },
            {
              date: BASE_DATE,
              accountId: "liability-1",
              description: "",
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: 60,
            },
          ],
        }),
      }),
    ).rejects.toThrow(GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE);
  });

  it("blocks updates for opening-balance transactions", async () => {
    prisma.booking.count.mockResolvedValueOnce(2);

    await expect(
      updateTransaction({
        data: {
          transactionId: "tx-opening",
          ...createTransactionInput(),
        },
      }),
    ).rejects.toThrow(OPENING_BALANCES_MANAGEMENT_MESSAGE);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("updates non-opening transactions by replacing bookings", async () => {
    await updateTransaction({
      data: {
        transactionId: "tx-regular",
        ...createTransactionInput(),
      },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.booking.deleteMany).toHaveBeenCalledWith({
      where: {
        transactionId: "tx-regular",
        accountBookId: "book-1",
      },
    });
    expect(prisma.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_accountBookId: {
            id: "tx-regular",
            accountBookId: "book-1",
          },
        },
      }),
    );
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });

  it("rejects update transaction when gain/loss booking is not simple", async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      {
        id: "gain-loss-1",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
      },
      {
        id: "income-1",
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.INCOME,
      },
    ]);

    await expect(
      updateTransaction({
        data: {
          transactionId: "tx-regular",
          ...createTransactionInput({
            bookings: [
              {
                date: BASE_DATE,
                accountId: "gain-loss-1",
                description: "",
                unit: Unit.CURRENCY,
                currency: "CHF",
                value: 100,
              },
              {
                date: BASE_DATE,
                accountId: "income-1",
                description: "",
                unit: Unit.CURRENCY,
                currency: "CHF",
                value: -100,
              },
            ],
          }),
        },
      }),
    ).rejects.toThrow(GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("blocks rebook when source transaction contains opening-balance bookings", async () => {
    prisma.booking.count.mockResolvedValueOnce(1);

    await expect(
      rebookBooking({
        data: {
          accountBookId: "book-1",
          bookingId: "booking-1",
          targetAccountId: "target-1",
        },
      }),
    ).rejects.toThrow(OPENING_BALANCES_MANAGEMENT_MESSAGE);

    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it("rebooks booking to a valid target account", async () => {
    await expect(
      rebookBooking({
        data: {
          accountBookId: "book-1",
          bookingId: "booking-1",
          targetAccountId: "target-1",
        },
      }),
    ).resolves.toEqual({ transactionId: "tx-1" });

    expect(prisma.booking.update).toHaveBeenCalledWith({
      where: {
        id_accountBookId: {
          id: "booking-1",
          accountBookId: "book-1",
        },
      },
      data: {
        account: {
          connect: {
            id_accountBookId: {
              id: "target-1",
              accountBookId: "book-1",
            },
          },
        },
      },
    });
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });

  it("rejects rebook when resulting gain/loss transaction is not simple", async () => {
    prisma.account.findUnique.mockResolvedValueOnce({
      id: "target-expense",
      isActive: true,
      unit: Unit.CURRENCY,
      currency: "CHF",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
    });
    prisma.booking.findMany.mockResolvedValueOnce([
      createBookingType("booking-1", AccountType.ASSET, null),
      createBookingType(
        "booking-2",
        AccountType.EQUITY,
        EquityAccountSubtype.GAIN_LOSS,
      ),
    ]);

    await expect(
      rebookBooking({
        data: {
          accountBookId: "book-1",
          bookingId: "booking-1",
          targetAccountId: "target-expense",
        },
      }),
    ).rejects.toThrow(GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE);

    expect(prisma.booking.update).not.toHaveBeenCalled();
  });
});
