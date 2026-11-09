import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import { GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE } from "../../shared/transactions/gain-loss-transaction-invariant";
import {
  BASE_DATE,
  cleanupTransactionMutation,
  createAssetAccount,
  createTransaction,
  createTransactionInput,
  createTransactions,
  invalidatePeriodBaseDataCacheForAccountBook,
  prisma,
  resetTransactionMutation,
  updateTransaction,
} from "./transactions-mutations.test-support";

describe("transactions mutations", () => {
  beforeEach(resetTransactionMutation);
  afterEach(cleanupTransactionMutation);

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

  it.each(["create", "update", "import"] as const)(
    "rejects incompatible account units before any %s writes",
    async (operation) => {
      const valid = createTransactionInput();
      const invalid = createTransactionInput({
        bookings: valid.bookings.map((booking) => ({
          ...booking,
          currency: "USD",
        })),
      });
      const mutation =
        operation === "create"
          ? createTransaction({ data: invalid })
          : operation === "update"
            ? updateTransaction({
                data: { ...invalid, transactionId: "tx-regular" },
              })
            : createTransactions({
                data: {
                  accountBookId: "book-1",
                  transactions: [valid, invalid].map(
                    ({ accountBookId: _accountBookId, ...transaction }) =>
                      transaction,
                  ),
                },
              });

      await expect(mutation).rejects.toThrow(
        "Booking 0: Account must use the same unit as the booking.",
      );
      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(prisma.transaction.update).not.toHaveBeenCalled();
      expect(prisma.booking.deleteMany).not.toHaveBeenCalled();
      expect(
        invalidatePeriodBaseDataCacheForAccountBook,
      ).not.toHaveBeenCalled();
    },
  );

  it("allows mixed-unit transfers when each booking matches its balance account", async () => {
    prisma.account.findMany.mockResolvedValueOnce([
      createAssetAccount("asset-1"),
      { ...createAssetAccount("asset-2"), currency: "EUR" },
    ]);
    const input = createTransactionInput();
    input.bookings[1] = {
      ...input.bookings[1],
      accountId: "asset-2",
      currency: "EUR",
      value: -90,
    };
    await expect(createTransaction({ data: input })).resolves.toEqual({
      id: "tx-created",
    });
    expect(prisma.transaction.create).toHaveBeenCalledOnce();
  });

  it("creates statement-import transactions in a single batch", async () => {
    const created = [{ id: "tx-1" }, { id: "tx-2" }];
    prisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(prisma),
    );
    prisma.transaction.create
      .mockResolvedValueOnce(created[0])
      .mockResolvedValueOnce(created[1]);

    await expect(
      createTransactions({
        data: {
          accountBookId: "book-1",
          transactions: [
            createTransactionInput({ description: "First" }),
            createTransactionInput({ description: "Second" }),
          ].map(
            ({ accountBookId: _accountBookId, ...transaction }) => transaction,
          ),
        },
      }),
    ).resolves.toEqual(created);

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.transaction.create).toHaveBeenCalledTimes(2);
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });

  it("forces batch transaction inputs to use the authorized account book id", async () => {
    prisma.$transaction.mockImplementationOnce(async (callback) =>
      callback(prisma),
    );

    const { accountBookId: _accountBookId, ...transaction } =
      createTransactionInput({ accountBookId: "other-book" });
    await expect(
      createTransactions({
        data: {
          accountBookId: "book-1",
          transactions: [
            {
              ...transaction,
              accountBookId: "other-book",
            } as typeof transaction,
          ],
        },
      }),
    ).resolves.toEqual([{ id: "tx-created" }]);

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountBookId: "book-1",
        }),
      }),
    );
    expect(invalidatePeriodBaseDataCacheForAccountBook).toHaveBeenCalledWith(
      "book-1",
    );
  });

  it("rejects invalid statement-import batches before creating any transaction", async () => {
    await expect(
      createTransactions({
        data: {
          accountBookId: "book-1",
          transactions: [
            {
              description: "Invalid",
              bookings: [
                {
                  date: BASE_DATE,
                  accountId: "asset-1",
                  description: "",
                  unit: Unit.CURRENCY,
                  currency: "CHF",
                  value: 50,
                },
              ],
            },
          ],
        },
      }),
    ).rejects.toThrow("At least two bookings are required.");

    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
    expect(invalidatePeriodBaseDataCacheForAccountBook).not.toHaveBeenCalled();
  });

  it("rejects full transactions with non-canonical time-bearing dates", async () => {
    await expect(
      createTransaction({
        data: createTransactionInput({
          bookings: [
            {
              date: "2026-01-11T23:00:00.000Z",
              accountId: "asset-1",
              description: "",
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: 50,
            },
            {
              date: "2026-01-11T23:00:00.000Z",
              accountId: "counter-1",
              description: "",
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: -50,
            },
          ],
        }),
      }),
    ).rejects.toThrow("date must be a valid UTC day");

    expect(prisma.transaction.create).not.toHaveBeenCalled();
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
        type: AccountType.BALANCE,
        equityAccountSubtype: null,
      },
      {
        id: "liability-1",
        type: AccountType.BALANCE,
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
});
