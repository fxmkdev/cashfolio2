import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, Unit } from "../.prisma-client/enums";
import { toMoney } from "../shared/money";

const mocks = vi.hoisted(() => ({
  ensureAuthorizedForAccountBookId: vi.fn(),
  convertBookingValueToReference: vi.fn(),
  prisma: {
    account: { findUniqueOrThrow: vi.fn() },
    accountBook: { findUniqueOrThrow: vi.fn() },
    booking: { findMany: vi.fn() },
  },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (data: unknown) => unknown;
    const chain = {
      validator: (validator: typeof validate) => {
        validate = validator;
        return chain;
      },
      handler:
        (handler: ({ data }: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) =>
          handler({ data: validate(data) }),
    };
    return chain;
  },
}));

vi.mock("../prisma.server", () => ({ prisma: mocks.prisma }));
vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId: mocks.ensureAuthorizedForAccountBookId,
}));
vi.mock("./period/period-conversion", () => ({
  convertBookingValueToReference: mocks.convertBookingValueToReference,
}));

import { getLedgerData } from "./ledger";

describe("getLedgerData reference currency", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.account.findUniqueOrThrow.mockResolvedValue({
      type: AccountType.ASSET,
      equityAccountSubtype: null,
      unit: Unit.CURRENCY,
      currency: "USD",
      cryptocurrency: null,
      symbol: null,
      tradeCurrency: null,
    });
    mocks.prisma.accountBook.findUniqueOrThrow.mockResolvedValue({
      referenceCurrency: "chf",
    });
    mocks.prisma.booking.findMany.mockResolvedValue([
      {
        id: "booking-1",
        date: new Date("2026-01-02Z"),
        description: "Deposit",
        value: toMoney(10),
        unit: Unit.CURRENCY,
        currency: "USD",
        cryptocurrency: null,
        symbol: null,
        tradeCurrency: null,
        transactionId: "transaction-1",
        transaction: { description: "Deposit", bookings: [] },
      },
    ]);
    mocks.convertBookingValueToReference.mockResolvedValue(toMoney(9));
  });

  it.each([false, undefined])(
    "returns the book currency without booking conversion when includeReferenceValues is %s",
    async (includeReferenceValues) => {
      const data = await getLedgerData({
        data: {
          accountBookId: "book-1",
          accountId: "account-1",
          includeReferenceValues,
        },
      });

      expect(mocks.ensureAuthorizedForAccountBookId).toHaveBeenCalledWith(
        "book-1",
      );
      expect(mocks.prisma.accountBook.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: "book-1" },
        select: { referenceCurrency: true },
      });
      expect(data.referenceCurrency).toBe("CHF");
      expect(data.rows).toEqual([
        expect.objectContaining({
          debit: 10,
          referenceDebit: null,
          referenceCredit: null,
        }),
      ]);
      expect(mocks.convertBookingValueToReference).not.toHaveBeenCalled();
    },
  );

  it("still converts bookings only when reference values are requested", async () => {
    const data = await getLedgerData({
      data: {
        accountBookId: "book-1",
        accountId: "account-1",
        includeReferenceValues: true,
      },
    });

    expect(data.referenceCurrency).toBe("CHF");
    expect(
      mocks.convertBookingValueToReference,
    ).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ referenceCurrency: "CHF", currency: "USD" }),
    );
    expect(data.rows).toEqual([
      expect.objectContaining({ debit: 10, referenceDebit: 9 }),
    ]);
  });
});
