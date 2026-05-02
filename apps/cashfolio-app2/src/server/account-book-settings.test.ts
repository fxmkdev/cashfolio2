import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const tx = vi.hoisted(() => ({
  accountBook: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  booking: {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
  },
}));

const prisma = vi.hoisted(() => ({
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
  getAccountBookSettings,
  updateAccountBookSettings,
} from "./account-book-settings";

describe("account-book settings server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      id: "book-1",
      name: "My Book",
      referenceCurrency: "chf",
      startDate: new Date("2026-01-03T12:30:00.000Z"),
    });

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    tx.accountBook.findUniqueOrThrow.mockResolvedValue({
      id: "book-1",
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-03T00:00:00.000Z"),
    });
    tx.accountBook.update.mockResolvedValue({
      id: "book-1",
      name: "Updated Book",
      referenceCurrency: "USD",
      startDate: new Date("2026-01-02T00:00:00.000Z"),
    });
    tx.booking.findFirst.mockResolvedValue(null);
    tx.booking.updateMany.mockResolvedValue({ count: 0 });
    tx.transaction.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads account-book settings", async () => {
    const result = await getAccountBookSettings({
      data: { accountBookId: "book-1" },
    });

    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
    expect(prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "book-1" },
      select: {
        id: true,
        name: true,
        referenceCurrency: true,
        startDate: true,
      },
    });
    expect(result).toEqual({
      id: "book-1",
      name: "My Book",
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-03T00:00:00.000Z"),
    });
  });

  it("updates name only without cache invalidation", async () => {
    tx.accountBook.update.mockResolvedValue({
      id: "book-1",
      name: "Renamed",
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-03T00:00:00.000Z"),
    });

    const result = await updateAccountBookSettings({
      data: {
        accountBookId: "book-1",
        name: "  Renamed  ",
        referenceCurrency: "chf",
        startDate: "2026-01-03",
      },
    });

    expect(ensureSameOriginRequestFromServerContext).toHaveBeenCalledTimes(1);
    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: "book-1",
      name: "Renamed",
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-03T00:00:00.000Z"),
    });
  });

  it("updates reference currency and invalidates cache", async () => {
    tx.accountBook.update.mockResolvedValue({
      id: "book-1",
      name: "Updated Book",
      referenceCurrency: "USD",
      startDate: new Date("2026-01-03T00:00:00.000Z"),
    });

    await updateAccountBookSettings({
      data: {
        accountBookId: "book-1",
        name: "Updated Book",
        referenceCurrency: "usd",
        startDate: "2026-01-03",
      },
    });

    expect(tx.accountBook.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          referenceCurrency: "USD",
        }),
      }),
    );
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });

  it("updates start date and migrates opening transactions", async () => {
    tx.transaction.findMany.mockResolvedValue([
      { id: "tx-opening-1" },
      { id: "tx-opening-2" },
    ]);

    await updateAccountBookSettings({
      data: {
        accountBookId: "book-1",
        name: "Updated Book",
        referenceCurrency: "CHF",
        startDate: "2026-01-02",
      },
    });

    expect(tx.transaction.findMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        bookings: {
          some: {
            account: {
              type: "EQUITY",
              equityAccountSubtype: "OPENING_BALANCES",
            },
          },
        },
      },
      select: { id: true },
    });
    expect(tx.booking.updateMany).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        transactionId: {
          in: ["tx-opening-1", "tx-opening-2"],
        },
      },
      data: {
        date: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });

  it("rejects start date after the first non-opening booking date", async () => {
    tx.booking.findFirst.mockResolvedValue({
      date: new Date("2026-01-03T16:12:00.000Z"),
    });

    await expect(
      updateAccountBookSettings({
        data: {
          accountBookId: "book-1",
          name: "Updated Book",
          referenceCurrency: "CHF",
          startDate: "2026-01-04",
        },
      }),
    ).rejects.toThrow(
      "Start date cannot be after first non-opening booking date (2026-01-03).",
    );

    expect(tx.accountBook.update).not.toHaveBeenCalled();
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it("allows start date equal to the first non-opening booking date", async () => {
    tx.booking.findFirst.mockResolvedValue({
      date: new Date("2026-01-03T16:12:00.000Z"),
    });
    tx.accountBook.update.mockResolvedValue({
      id: "book-1",
      name: "Updated Book",
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-03T00:00:00.000Z"),
    });

    await expect(
      updateAccountBookSettings({
        data: {
          accountBookId: "book-1",
          name: "Updated Book",
          referenceCurrency: "CHF",
          startDate: "2026-01-03",
        },
      }),
    ).resolves.toEqual({
      id: "book-1",
      name: "Updated Book",
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-03T00:00:00.000Z"),
    });
  });

  it("rejects invalid reference currency", async () => {
    await expect(
      updateAccountBookSettings({
        data: {
          accountBookId: "book-1",
          name: "Updated Book",
          referenceCurrency: "INVALID",
          startDate: "2026-01-03",
        },
      }),
    ).rejects.toThrow("Reference currency is invalid.");

    expect(tx.accountBook.update).not.toHaveBeenCalled();
  });

  it("rejects inherited object keys as reference currency", async () => {
    await expect(
      updateAccountBookSettings({
        data: {
          accountBookId: "book-1",
          name: "Updated Book",
          referenceCurrency: "toString",
          startDate: "2026-01-03",
        },
      }),
    ).rejects.toThrow("Reference currency is invalid.");

    expect(tx.accountBook.update).not.toHaveBeenCalled();
  });

  it("rejects missing start date as required", async () => {
    await expect(
      updateAccountBookSettings({
        data: {
          accountBookId: "book-1",
          name: "Updated Book",
          referenceCurrency: "CHF",
          startDate: "",
        },
      }),
    ).rejects.toThrow("Start date is required.");

    expect(tx.accountBook.update).not.toHaveBeenCalled();
  });

  it("rejects future start date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T12:00:00.000Z"));

    await expect(
      updateAccountBookSettings({
        data: {
          accountBookId: "book-1",
          name: "Updated Book",
          referenceCurrency: "CHF",
          startDate: "2026-01-11",
        },
      }),
    ).rejects.toThrow("Start date cannot be in the future.");
  });

  it("queries first non-opening booking by excluding opening transactions", async () => {
    await updateAccountBookSettings({
      data: {
        accountBookId: "book-1",
        name: "Updated Book",
        referenceCurrency: "CHF",
        startDate: "2026-01-03",
      },
    });

    expect(tx.booking.findFirst).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        transaction: {
          bookings: {
            none: {
              account: {
                type: "EQUITY",
                equityAccountSubtype: "OPENING_BALANCES",
              },
            },
          },
        },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: { date: true },
    });
  });
});
