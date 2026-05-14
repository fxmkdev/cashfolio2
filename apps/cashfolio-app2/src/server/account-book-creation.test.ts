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

const ensureSameOriginRequestFromServerContext = vi.hoisted(() => vi.fn());
const ensureUser = vi.hoisted(() => vi.fn());

const tx = vi.hoisted(() => ({
  accountBook: {
    create: vi.fn(),
  },
}));

const prisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../security/same-origin.server", () => ({
  ensureSameOriginRequestFromServerContext,
}));

vi.mock("../users/functions.server", () => ({
  ensureUser,
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

import { createAccountBook } from "./account-book-creation";

describe("createAccountBook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T12:00:00.000Z"));

    ensureUser.mockResolvedValue({ id: "user-1" });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    tx.accountBook.create.mockResolvedValue({
      id: "book-1",
      name: "My Book",
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-03T12:30:00.000Z"),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates an empty account book linked to the user and relies on the database trigger for Gain/Loss", async () => {
    const result = await createAccountBook({
      data: {
        name: "  My Book  ",
        referenceCurrency: "chf",
        startDate: "2026-01-03T12:30:00.000Z",
      },
    });

    expect(ensureSameOriginRequestFromServerContext).toHaveBeenCalledTimes(1);
    expect(ensureUser).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.accountBook.create).toHaveBeenCalledWith({
      data: {
        name: "My Book",
        referenceCurrency: "CHF",
        startDate: new Date("2026-01-03T00:00:00.000Z"),
        userLinks: {
          create: {
            userId: "user-1",
          },
        },
      },
      select: {
        id: true,
        name: true,
        referenceCurrency: true,
        startDate: true,
      },
    });
    expect(tx.accountBook.create.mock.calls[0]![0].data).not.toHaveProperty(
      "accounts",
    );
    expect(tx.accountBook.create.mock.calls[0]![0].data).not.toHaveProperty(
      "groups",
    );
    expect(tx.accountBook.create.mock.calls[0]![0].data).not.toHaveProperty(
      "transactions",
    );
    expect(tx.accountBook.create.mock.calls[0]![0].data).not.toHaveProperty(
      "bookings",
    );
    expect(result).toEqual({
      id: "book-1",
      name: "My Book",
      referenceCurrency: "CHF",
      startDate: "2026-01-03T00:00:00.000Z",
    });
  });

  it("rejects missing account book name", async () => {
    await expect(
      createAccountBook({
        data: {
          name: "  ",
          referenceCurrency: "CHF",
          startDate: "2026-01-03",
        },
      }),
    ).rejects.toThrow("Account book name is required.");

    expect(tx.accountBook.create).not.toHaveBeenCalled();
  });

  it("rejects invalid reference currency", async () => {
    await expect(
      createAccountBook({
        data: {
          name: "My Book",
          referenceCurrency: "INVALID",
          startDate: "2026-01-03",
        },
      }),
    ).rejects.toThrow("Reference currency is invalid.");

    expect(tx.accountBook.create).not.toHaveBeenCalled();
  });

  it("rejects missing start date", async () => {
    await expect(
      createAccountBook({
        data: {
          name: "My Book",
          referenceCurrency: "CHF",
          startDate: "",
        },
      }),
    ).rejects.toThrow("Start date is required.");

    expect(tx.accountBook.create).not.toHaveBeenCalled();
  });

  it("rejects future start date", async () => {
    await expect(
      createAccountBook({
        data: {
          name: "My Book",
          referenceCurrency: "CHF",
          startDate: "2026-01-11",
        },
      }),
    ).rejects.toThrow("Start date cannot be in the future.");

    expect(tx.accountBook.create).not.toHaveBeenCalled();
  });
});
