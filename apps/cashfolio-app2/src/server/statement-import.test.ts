import { beforeEach, describe, expect, it, vi } from "vitest";
import { Unit } from "@/.prisma-client/enums";
import { toMoney } from "@/shared/money";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  account: vi.fn(),
  bookings: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (validate: (data: unknown) => unknown) => ({
      handler:
        (handler: (args: { data: unknown }) => unknown) =>
        (args: { data: unknown }) =>
          handler({ data: validate(args.data) }),
    }),
  }),
}));
vi.mock("@/account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId: mocks.authorize,
}));
vi.mock("@/prisma.server", () => ({
  prisma: {
    account: { findUniqueOrThrow: mocks.account },
    booking: { findMany: mocks.bookings },
  },
}));
import { getStatementImportExistingBookings } from "./statement-import";

const input = {
  accountBookId: "book-1",
  accountId: "account-1",
};

describe("statement import existing bookings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.account.mockResolvedValue({ unit: Unit.CURRENCY, currency: "CHF" });
    mocks.bookings.mockResolvedValue([]);
  });

  it("scopes account and bookings to the authorized book and unit across complete history", async () => {
    await getStatementImportExistingBookings({ data: input });
    expect(mocks.authorize).toHaveBeenCalledWith("book-1");
    expect(mocks.account).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_accountBookId: { id: "account-1", accountBookId: "book-1" },
        },
      }),
    );
    expect(mocks.bookings).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accountBookId: "book-1",
          accountId: "account-1",
          unit: Unit.CURRENCY,
          currency: "CHF",
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      }),
    );
    expect(mocks.bookings.mock.calls[0][0].where).not.toHaveProperty("date");
    expect(mocks.authorize.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.account.mock.invocationCallOrder[0],
    );
  });

  it.each([
    {
      account: { unit: Unit.CRYPTOCURRENCY, cryptocurrency: "BTC" },
      unitFields: { unit: Unit.CRYPTOCURRENCY, cryptocurrency: "BTC" },
    },
    {
      account: { unit: Unit.SECURITY, symbol: "VWRL", tradeCurrency: "USD" },
      unitFields: { unit: Unit.SECURITY, symbol: "VWRL" },
    },
  ])(
    "filters the canonical account unit: %j",
    async ({ account, unitFields }) => {
      mocks.account.mockResolvedValue(account);
      await getStatementImportExistingBookings({
        data: input,
      });
      expect(mocks.bookings).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            accountBookId: input.accountBookId,
            accountId: input.accountId,
            ...unitFields,
          },
        }),
      );
    },
  );

  it("includes a rebooked security with a different trade currency but the same symbol", async () => {
    mocks.account.mockResolvedValue({
      unit: Unit.SECURITY,
      symbol: "AAPL",
      tradeCurrency: "CHF",
    });
    const booking = {
      id: "rebooked-security",
      transactionId: "security-transaction",
      unit: Unit.SECURITY,
      symbol: "AAPL",
      tradeCurrency: "USD",
      date: new Date("2026-02-12"),
      value: toMoney("2.5"),
      description: "Rebooked AAPL",
      transaction: { description: "Original purchase" },
    };
    mocks.bookings.mockImplementation(async ({ where }) =>
      [booking].filter(
        (candidate) =>
          candidate.unit === where.unit &&
          candidate.symbol === where.symbol &&
          (where.tradeCurrency === undefined ||
            candidate.tradeCurrency === where.tradeCurrency),
      ),
    );

    expect(await getStatementImportExistingBookings({ data: input })).toEqual([
      {
        id: booking.id,
        transactionId: booking.transactionId,
        date: "2026-02-12",
        amount: "2.5",
        description: booking.description,
      },
    ]);
    expect(mocks.bookings.mock.calls[0][0].where).not.toHaveProperty(
      "tradeCurrency",
    );
  });

  it("returns decimal strings and prefers booking descriptions over transaction descriptions", async () => {
    mocks.bookings.mockResolvedValue([
      {
        id: "b1",
        transactionId: "t1",
        date: new Date("2026-02-12"),
        value: toMoney("-12.340000000000000001"),
        description: "Edited booking",
        transaction: { description: "Original transaction" },
      },
      {
        id: "b2",
        transactionId: "t2",
        date: new Date("2026-02-28T18:00:00Z"),
        value: toMoney("3.10"),
        description: "",
        transaction: { description: "Edited transaction" },
      },
    ]);
    expect(await getStatementImportExistingBookings({ data: input })).toEqual([
      {
        id: "b1",
        transactionId: "t1",
        date: "2026-02-12",
        amount: "-12.340000000000000001",
        description: "Edited booking",
      },
      {
        id: "b2",
        transactionId: "t2",
        date: "2026-02-28",
        amount: "3.1",
        description: "Edited transaction",
      },
    ]);
  });

  it("does not query when authorization fails", async () => {
    mocks.authorize.mockRejectedValue(new Error("Unauthorized"));
    await expect(
      getStatementImportExistingBookings({ data: input }),
    ).rejects.toThrow("Unauthorized");
    expect(mocks.account).not.toHaveBeenCalled();
    expect(mocks.bookings).not.toHaveBeenCalled();
  });

  it("does not query bookings when the account is absent", async () => {
    mocks.account.mockRejectedValue(new Error("Account not found"));
    await expect(
      getStatementImportExistingBookings({ data: input }),
    ).rejects.toThrow("Account not found");
    expect(mocks.bookings).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    {},
    { ...input, accountId: "" },
    { ...input, accountBookId: 1 },
  ])("rejects malformed input before authorization: %j", async (data) => {
    await expect(async () =>
      getStatementImportExistingBookings({ data }),
    ).rejects.toThrow();
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.bookings).not.toHaveBeenCalled();
  });
});
