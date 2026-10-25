import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import { Prisma } from "../../.prisma-client/client";

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  booking: { findMany: vi.fn(), updateMany: vi.fn() },
  transaction: { findMany: vi.fn(), deleteMany: vi.fn() },
  account: { findUnique: vi.fn() },
  accountBook: { findUniqueOrThrow: vi.fn() },
}));
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  authorize: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("../../prisma.server", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("../mutation-guard.server", () => ({
  ensureAuthorizedAccountBookMutation: mocks.authorize,
}));
vi.mock("../period/cache/period-base-data-cache", () => ({
  invalidatePeriodBaseDataCacheForAccountBook: mocks.invalidate,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (validate: (input: unknown) => unknown) => ({
      handler:
        (handler: (args: { data: unknown }) => unknown) =>
        (args: { data: unknown }) =>
          handler({ data: validate(args.data) }),
    }),
  }),
}));

import { deleteTransactions, rebookBookings } from "./transactions-mutations";
import {
  validateDeleteTransactionsInput,
  validateRebookBookingsInput,
} from "./transactions-input-validation";

const target = {
  id: "target",
  isActive: true,
  type: AccountType.BALANCE,
  equityAccountSubtype: null,
  unit: Unit.CURRENCY,
  currency: "CHF",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
};
const source = { ...target, id: "source" };
const booking = {
  id: "booking-1",
  accountId: "source",
  transactionId: "transaction-1",
  date: new Date("2026-05-01"),
  value: new Prisma.Decimal(10),
  unit: Unit.CURRENCY,
  currency: "CHF",
  cryptocurrency: null,
  symbol: null,
  tradeCurrency: null,
};
const opening = {
  ...target,
  type: AccountType.EQUITY,
  equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
};
const rebookInput = {
  accountBookId: "book",
  bookingIds: ["booking-1", "booking-2"],
  targetAccountId: "target",
};
const deleteInput = {
  accountBookId: "book",
  transactionIds: ["transaction-1", "transaction-2"],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (operation) => operation(tx));
  tx.$queryRaw.mockResolvedValue([{ id: "book" }]);
  tx.account.findUnique.mockResolvedValue(target);
  tx.accountBook.findUniqueOrThrow.mockResolvedValue({
    startDate: new Date("2026-01-01"),
  });
  tx.booking.findMany
    .mockResolvedValueOnce([
      booking,
      { ...booking, id: "booking-2", transactionId: "transaction-2" },
    ])
    .mockResolvedValue([
      { id: "booking-1", transactionId: "transaction-1", account: source },
      { id: "counter-1", transactionId: "transaction-1", account: source },
      { id: "booking-2", transactionId: "transaction-2", account: source },
    ]);
  tx.transaction.findMany.mockResolvedValue(
    deleteInput.transactionIds.map((id) => ({
      id,
      bookings: [{ account: source }],
    })),
  );
});

describe("bulk input contracts", () => {
  it.each([
    undefined,
    null,
    {},
    [],
    { accountBookId: "book", transactionIds: [] },
    { accountBookId: "book", transactionIds: [null] },
    { accountBookId: "book", transactionIds: [" "] },
  ])("rejects malformed deletion %j", (data) => {
    expect(() => validateDeleteTransactionsInput(data)).toThrow();
  });
  it.each([
    { ...rebookInput, bookingIds: [] },
    { ...rebookInput, bookingIds: [42] },
    { ...rebookInput, targetAccountId: "" },
    { ...rebookInput, accountBookId: null },
  ])("rejects malformed rebooking %j", (data) => {
    expect(() => validateRebookBookingsInput(data)).toThrow();
  });
  it("deduplicates both identifier arrays", () => {
    expect(
      validateDeleteTransactionsInput({
        ...deleteInput,
        transactionIds: ["a", "a"],
      }).transactionIds,
    ).toEqual(["a"]);
    expect(
      validateRebookBookingsInput({ ...rebookInput, bookingIds: ["b", "b"] })
        .bookingIds,
    ).toEqual(["b"]);
  });
});

describe("atomic bulk mutations", () => {
  it("rebooks all bookings using the locked transaction client and invalidates once", async () => {
    const result = await rebookBookings({ data: rebookInput });
    expect(result).toEqual({ transactionIds: deleteInput.transactionIds });
    expect(mocks.authorize).toHaveBeenCalledWith("book");
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "ReadCommitted",
      timeout: 30_000,
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.booking.findMany.mock.invocationCallOrder[0],
    );
    expect(tx.booking.updateMany).toHaveBeenCalledWith({
      where: { accountBookId: "book", id: { in: rebookInput.bookingIds } },
      data: { accountId: "target" },
    });
    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith("book");
  });
  it("deletes complete transactions scoped to the book", async () => {
    await deleteTransactions({ data: deleteInput });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.transaction.findMany.mock.invocationCallOrder[0],
    );
    expect(tx.transaction.deleteMany).toHaveBeenCalledWith({
      where: { accountBookId: "book", id: { in: deleteInput.transactionIds } },
    });
    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith("book");
  });
  it.each(["delete", "rebook"])(
    "denies unauthorized %s before database work",
    async (action) => {
      mocks.authorize.mockRejectedValue(new Error("Forbidden"));
      const result =
        action === "delete"
          ? deleteTransactions({ data: deleteInput })
          : rebookBookings({ data: rebookInput });
      await expect(result).rejects.toThrow("Forbidden");
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );
  it("rejects missing or cross-book transactions without deleting any", async () => {
    tx.transaction.findMany.mockResolvedValue([
      { id: "transaction-1", bookings: [] },
    ]);
    await expect(deleteTransactions({ data: deleteInput })).rejects.toThrow(
      "no longer exist",
    );
    expect(tx.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountBookId: "book",
          id: { in: deleteInput.transactionIds },
        },
      }),
    );
    expect(tx.transaction.deleteMany).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("rejects missing or cross-book bookings without updating any", async () => {
    tx.booking.findMany.mockReset().mockResolvedValue([booking]);
    await expect(rebookBookings({ data: rebookInput })).rejects.toThrow(
      "no longer exist",
    );
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
  });
  it("rejects deletion if any selected transaction contains opening balances", async () => {
    tx.transaction.findMany.mockResolvedValue([
      { id: "transaction-1", bookings: [] },
      { id: "transaction-2", bookings: [{ account: opening }] },
    ]);
    await expect(deleteTransactions({ data: deleteInput })).rejects.toThrow(
      "Opening balance transactions",
    );
    expect(tx.transaction.deleteMany).not.toHaveBeenCalled();
  });
  it("rejects rebooking a protected transaction even when its opening booking was not selected", async () => {
    tx.booking.findMany.mockResolvedValueOnce([
      { id: "other", transactionId: "transaction-2", account: opening },
    ]);
    await expect(rebookBookings({ data: rebookInput })).rejects.toThrow(
      "Opening balance transactions",
    );
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
  });
  it.each([
    ["missing", null],
    ["inactive", { ...target, isActive: false }],
    ["same account", source],
    ["incompatible unit", { ...target, currency: "USD" }],
    ["opening balance target", opening],
    [
      "income debit",
      {
        ...target,
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.INCOME,
      },
    ],
  ])("rejects %s target before writing", async (_, account) => {
    tx.account.findUnique.mockResolvedValue(account);
    await expect(rebookBookings({ data: rebookInput })).rejects.toThrow();
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("validates all bookings, including the last booking's date", async () => {
    tx.booking.findMany
      .mockReset()
      .mockResolvedValueOnce([
        booking,
        { ...booking, id: "booking-2", date: new Date("2025-01-01") },
      ]);
    tx.booking.findMany.mockResolvedValue([]);
    await expect(rebookBookings({ data: rebookInput })).rejects.toThrow(
      "Date cannot be before",
    );
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
  });
  it("validates Gain/Loss against the final combined selection", async () => {
    tx.account.findUnique.mockResolvedValue({
      ...target,
      type: AccountType.EQUITY,
      equityAccountSubtype: EquityAccountSubtype.GAIN_LOSS,
    });
    tx.booking.findMany
      .mockReset()
      .mockResolvedValueOnce([booking, { ...booking, id: "booking-2" }])
      .mockResolvedValue([
        { id: "booking-1", transactionId: "transaction-1", account: source },
        { id: "booking-2", transactionId: "transaction-1", account: source },
      ]);
    await expect(rebookBookings({ data: rebookInput })).rejects.toThrow(
      "exactly one Gain/Loss",
    );
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
  });
  it("returns unique affected transactions when multiple selected bookings share one transaction", async () => {
    tx.booking.findMany
      .mockReset()
      .mockResolvedValueOnce([booking, { ...booking, id: "booking-2" }])
      .mockResolvedValue([]);
    await expect(rebookBookings({ data: rebookInput })).resolves.toEqual({
      transactionIds: ["transaction-1"],
    });
  });
  it("does not invalidate cache when the write fails and the transaction rolls back", async () => {
    tx.transaction.deleteMany.mockRejectedValue(new Error("Write failed"));
    await expect(deleteTransactions({ data: deleteInput })).rejects.toThrow(
      "Write failed",
    );
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("retries the entire transaction on a serialization conflict", async () => {
    mocks.transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Conflict", {
        code: "P2034",
        clientVersion: "7",
      }),
    );
    await deleteTransactions({ data: deleteInput });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });
});
