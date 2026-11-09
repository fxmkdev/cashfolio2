import { beforeEach, describe, expect, it } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import {
  invalidatePeriodBaseDataCacheForAccountBook,
  resetAccountMutation,
  tx,
  updateAccount,
} from "./accounts-mutations.test-support";

describe("updateAccount opening balance management", () => {
  beforeEach(resetAccountMutation);

  it.each([-150, 150])(
    "updates an existing opening-balance transaction with signed input %s",
    async (openingBalance) => {
      const type = AccountType.BALANCE;
      tx.account.findUniqueOrThrow.mockResolvedValue({
        type,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        isCashAccount: false,
      });
      tx.account.update.mockResolvedValue({
        id: "account-1",
        name: "Account",
        type,
        unit: Unit.CURRENCY,
        currency: "CHF",
      });
      tx.transaction.findMany.mockResolvedValue([
        {
          id: "tx-open",
          bookings: [
            {
              id: "booking-account",
              accountId: "account-1",
              account: {
                id: "account-1",
                type,
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
          type,
          unit: Unit.CURRENCY,
          currency: "CHF",
          openingBalance,
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
                    unit: Unit.CURRENCY,
                    currency: "CHF",
                    value: String(openingBalance),
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
                    unit: Unit.CURRENCY,
                    currency: "CHF",
                    value: String(-openingBalance),
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
    },
  );

  it.each([AccountType.BALANCE])(
    "deletes %s opening-balance transactions when opening balance is removed",
    async (type) => {
      tx.account.findUniqueOrThrow.mockResolvedValue({
        type,
        equityAccountSubtype: null,
        unit: Unit.CURRENCY,
        currency: "CHF",
        isCashAccount: false,
      });
      tx.account.update.mockResolvedValue({
        id: "account-1",
        name: "Account",
        type,
        unit: Unit.CURRENCY,
        currency: "CHF",
      });
      tx.transaction.findMany.mockResolvedValue([
        {
          id: "tx-open",
          bookings: [
            {
              id: "booking-account",
              accountId: "account-1",
              account: {
                id: "account-1",
                type,
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
          type,
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
    },
  );

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
        type: AccountType.BALANCE,
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
                value: "-250",
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
