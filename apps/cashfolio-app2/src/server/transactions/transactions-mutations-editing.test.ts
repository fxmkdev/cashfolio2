import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "../../shared/accounts/opening-balances";
import { GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE } from "../../shared/transactions/gain-loss-transaction-invariant";
import {
  BASE_DATE,
  cleanupTransactionMutation,
  createBookingType,
  createTransactionInput,
  deleteTransaction,
  ensureAuthorizedForAccountBookId,
  ensureSameOriginRequestFromServerContext,
  invalidatePeriodBaseDataCacheForAccountBook,
  prisma,
  rebookBooking,
  resetTransactionMutation,
  updateTransaction,
} from "./transactions-mutations.test-support";

describe("transactions mutations", () => {
  beforeEach(resetTransactionMutation);
  afterEach(cleanupTransactionMutation);

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

    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
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

    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
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
      createBookingType("booking-1", AccountType.BALANCE, null),
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
