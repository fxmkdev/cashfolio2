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
const prisma = vi.hoisted(() => ({
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
  booking: {
    findFirst: vi.fn(),
  },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

import { getLedgerPeriodBounds } from "./ledger";

describe("getLedgerPeriodBounds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"));
    vi.clearAllMocks();
    prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      startDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    prisma.booking.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses today as max date when no future booking exists", async () => {
    await expect(
      getLedgerPeriodBounds({ data: { accountBookId: "book-1" } }),
    ).resolves.toMatchObject({
      minBookingDate: "2026-01-01T00:00:00.000Z",
      maxDate: "2026-02-10T00:00:00.000Z",
      currentDate: "2026-02-10T00:00:00.000Z",
    });
  });

  it("extends account-book period bounds to the latest future booking", async () => {
    prisma.booking.findFirst.mockResolvedValueOnce({
      date: new Date("2026-04-03T08:00:00.000Z"),
    });

    await expect(
      getLedgerPeriodBounds({ data: { accountBookId: "book-1" } }),
    ).resolves.toMatchObject({
      maxDate: "2026-04-03T00:00:00.000Z",
      currentDate: "2026-02-10T00:00:00.000Z",
    });
  });

  it("scopes period bounds to an account when account id is provided", async () => {
    await getLedgerPeriodBounds({
      data: { accountBookId: "book-1", accountId: "asset-1" },
    });

    expect(prisma.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountBookId: "book-1",
          accountId: "asset-1",
        },
      }),
    );
  });
});
