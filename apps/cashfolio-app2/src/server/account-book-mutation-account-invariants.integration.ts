import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import {
  account,
  bookId,
  boundary,
  createMutationDatabase,
  db,
  disposeMutationDatabase,
  expectRejected,
  groupUpdate,
  mutations,
  race,
  resetMutationDatabase,
  transactions,
} from "./account-book-mutation.test-support";
import type { CreateTransactionInput } from "./transactions/transactions-types";

describe("account-book mutation invariants against disposable PostgreSQL", () => {
  beforeAll(createMutationDatabase);
  beforeEach(resetMutationDatabase);
  afterAll(disposeMutationDatabase);

  it.each(["update", "import"] as const)(
    "preserves persisted transactions and cache revision after an incompatible-unit %s",
    async (operation) => {
      const source = await mutations.createAccount({ data: account("Source") });
      const target = await mutations.createAccount({ data: account("Target") });
      const valid: CreateTransactionInput = {
        accountBookId: bookId,
        description: "Original transfer",
        bookings: [source.id, target.id].map((accountId, index) => ({
          accountId,
          date: "2026-01-12",
          description: "",
          unit: Unit.CURRENCY,
          currency: "CHF",
          value: index === 0 ? 100 : -100,
        })),
      };
      const original = await transactions.createTransaction({ data: valid });
      const snapshot = () =>
        db.transaction.findMany({
          where: { accountBookId: bookId },
          orderBy: { id: "asc" },
          include: { bookings: { orderBy: { sortOrder: "asc" } } },
        });
      const before = await snapshot();
      const revision = await db.accountBook.findUniqueOrThrow({
        where: { id: bookId },
      });
      const invalid = {
        ...valid,
        description: "Invalid transfer",
        bookings: valid.bookings.map((booking) => ({
          ...booking,
          currency: "USD",
        })),
      };
      const mutation =
        operation === "update"
          ? transactions.updateTransaction({
              data: { ...invalid, transactionId: original.id },
            })
          : transactions.createTransactions({
              data: {
                accountBookId: bookId,
                transactions: [valid, invalid].map(
                  ({ accountBookId: _accountBookId, ...transaction }) =>
                    transaction,
                ),
              },
            });

      await expect(mutation).rejects.toThrow(
        "Booking 0: Account must use the same unit as the booking.",
      );
      expect(await snapshot()).toEqual(before);
      expect(
        (await db.accountBook.findUniqueOrThrow({ where: { id: bookId } }))
          .periodCacheRevision,
      ).toBe(revision.periodCacheRevision);
    },
  );

  it("rejects concurrent duplicate sibling names after the first account commits", async () => {
    const outcomes = await race(
      () => mutations.createAccount({ data: account("Wallet") }),
      () => mutations.createAccount({ data: account("wallet") }),
    );
    expectRejected(outcomes, "already exists");
    expect(
      await db.account.count({ where: { type: AccountType.BALANCE } }),
    ).toBe(1);
  });

  it("creates one shared opening-balances account for concurrent initial balances", async () => {
    const outcomes = await race(
      () =>
        mutations.createAccount({
          data: account("Wallet", { openingBalance: 10 }),
        }),
      () =>
        mutations.createAccount({
          data: account("Bank", { openingBalance: 20 }),
        }),
    );
    expect(outcomes.map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    expect(
      await db.account.count({
        where: { equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES },
      }),
    ).toBe(1);
    expect(await db.transaction.count()).toBe(2);
    expect(
      (
        await db.booking.aggregate({ _sum: { value: true } })
      )._sum.value?.toString(),
    ).toBe("0");
  });

  it("checks inherited cash status after a concurrent parent cash change", async () => {
    const outcomes = await race(
      () =>
        mutations.updateAccountGroup({
          data: { ...groupUpdate("A").data, isCashAccount: true },
        }),
      () =>
        mutations.createAccount({
          data: account("Security", {
            groupId: "A",
            unit: Unit.SECURITY,
            currency: undefined,
            symbol: "AAPL",
            tradeCurrency: "USD",
          }),
        }),
    );
    expectRejected(outcomes, "currency accounts");
    expect(await db.account.count({ where: { groupId: "A" } })).toBe(0);
  });

  it("rejects reactivating a child after its parent is concurrently archived", async () => {
    const child = await mutations.createAccount({
      data: account("Wallet", { groupId: "A" }),
    });
    await mutations.archiveAccount({
      data: { accountBookId: bookId, id: child.id },
    });
    const outcomes = await race(
      () =>
        mutations.archiveAccountGroup({
          data: { accountBookId: bookId, id: "A" },
        }),
      () =>
        mutations.unarchiveAccount({
          data: { accountBookId: bookId, id: child.id },
        }),
    );
    expectRejected(outcomes, "parent group is archived");
    expect(
      (
        await db.account.findUniqueOrThrow({
          where: { id_accountBookId: { id: child.id, accountBookId: bookId } },
        })
      ).isActive,
    ).toBe(false);
  });

  it("rolls back account and opening-balance writes when the transaction fails", async () => {
    const original = boundary.withAccountBookMutation;
    const spy = vi
      .spyOn(boundary, "withAccountBookMutation")
      .mockImplementationOnce((id, operation) =>
        original(id, async (tx) => {
          await operation(tx);
          throw new Error("Opening balance save failed.");
        }),
      );
    try {
      await expect(
        mutations.createAccount({
          data: account("Wallet", { openingBalance: 10 }),
        }),
      ).rejects.toThrow("Opening balance save failed.");
    } finally {
      spy.mockRestore();
    }
    expect(
      await db.account.count({ where: { type: AccountType.BALANCE } }),
    ).toBe(0);
    expect(await db.transaction.count()).toBe(0);
    expect(await db.booking.count()).toBe(0);
    // A failed mutation releases the lock so the next writer can proceed.
    await mutations.createAccount({
      data: account("Wallet", { openingBalance: 10 }),
    });
    expect(await db.transaction.count()).toBe(1);
  });

  it.each([
    ["archive", false],
    ["rebook", false],
    ["archive", true],
    ["rebook", true],
  ] as const)(
    "protects account balance and target status when %s wins the lock (bulk: %s)",
    async (first, bulk) => {
      const source = await mutations.createAccount({ data: account("Source") });
      const target = await mutations.createAccount({ data: account("Target") });
      const income = await mutations.createAccount({
        data: account("Salary", {
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.INCOME,
        }),
      });
      const transaction = await transactions.createSimpleTransaction({
        data: {
          accountBookId: bookId,
          accountId: source.id,
          counterAccountId: income.id,
          date: "2026-01-12",
          description: "Salary",
          amount: 100,
          direction: "DEBIT",
        },
      });
      const booking = await db.booking.findFirstOrThrow({
        where: { transactionId: transaction.id, accountId: source.id },
      });
      const archive = () =>
        mutations.archiveAccount({
          data: { accountBookId: bookId, id: target.id },
        });
      const rebook = () =>
        bulk
          ? transactions.rebookBookings({
              data: {
                accountBookId: bookId,
                bookingIds: [booking.id],
                targetAccountId: target.id,
              },
            })
          : transactions.rebookBooking({
              data: {
                accountBookId: bookId,
                bookingId: booking.id,
                targetAccountId: target.id,
              },
            });
      const outcomes = await race(
        first === "archive" ? archive : rebook,
        first === "archive" ? rebook : archive,
      );
      expectRejected(
        outcomes,
        first === "archive"
          ? "Target account must be active"
          : "balance is not 0",
      );
      const saved = await db.account.findUniqueOrThrow({
        where: { id_accountBookId: { id: target.id, accountBookId: bookId } },
      });
      expect(saved.isActive).toBe(first === "rebook");
      expect(await db.booking.count({ where: { accountId: target.id } })).toBe(
        first === "rebook" ? 1 : 0,
      );
    },
  );
});
