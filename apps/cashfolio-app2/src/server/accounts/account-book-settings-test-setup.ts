import { vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createServerFn = vi.fn(() => {
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
  });
  const ensureAuthorizedForAccountBookId = vi.fn();
  const ensureSameOriginRequestFromServerContext = vi.fn();
  const invalidatePeriodBaseDataCacheForAccountBook = vi.fn();
  const tx = {
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
  };
  const prisma = {
    accountBook: {
      findUniqueOrThrow: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  return {
    createServerFn,
    ensureAuthorizedForAccountBookId,
    ensureSameOriginRequestFromServerContext,
    invalidatePeriodBaseDataCacheForAccountBook,
    prisma,
    tx,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: mocks.createServerFn,
}));

vi.mock("../../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId: mocks.ensureAuthorizedForAccountBookId,
}));

vi.mock("../../security/same-origin.server", () => ({
  ensureSameOriginRequestFromServerContext:
    mocks.ensureSameOriginRequestFromServerContext,
}));

vi.mock("../../prisma.server", () => ({
  prisma: mocks.prisma,
}));

vi.mock("../period/period-base-data-cache", () => ({
  invalidatePeriodBaseDataCacheForAccountBook:
    mocks.invalidatePeriodBaseDataCacheForAccountBook,
}));

export const {
  createServerFn,
  ensureAuthorizedForAccountBookId,
  ensureSameOriginRequestFromServerContext,
  invalidatePeriodBaseDataCacheForAccountBook,
  prisma,
  tx,
} = mocks;

const accountBookSettings = await import("./account-book-settings");

export const {
  deleteAccountBook,
  getAccountBookSettings,
  updateAccountBookSettings,
} = accountBookSettings;

export function resetAccountBookSettingsMocks() {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-10T12:00:00.000Z"));

  prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
    id: "book-1",
    name: "My Book",
    referenceCurrency: "chf",
    startDate: new Date("2026-01-03T12:30:00.000Z"),
  });
  prisma.accountBook.delete.mockResolvedValue({
    id: "book-1",
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
}

export function restoreAccountBookSettingsMocks() {
  vi.useRealTimers();
}
