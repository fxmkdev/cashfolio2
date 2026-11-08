import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import {
  account,
  bookId,
  createMutationDatabase,
  db,
  disposeMutationDatabase,
  expectRejected,
  mutations,
  race,
  resetMutationDatabase,
  settings,
  transactions,
} from "./account-book-mutation.test-support";

describe("account-book mutation invariants against disposable PostgreSQL", () => {
  beforeAll(createMutationDatabase);
  beforeEach(resetMutationDatabase);
  afterAll(disposeMutationDatabase);

  it("validates booking dates after a concurrent book start-date change", async () => {
    const asset = await mutations.createAccount({ data: account("Wallet") });
    const income = await mutations.createAccount({
      data: account("Salary", {
        type: AccountType.EQUITY,
        equityAccountSubtype: EquityAccountSubtype.INCOME,
      }),
    });
    const outcomes = await race(
      () =>
        settings.updateAccountBookSettings({
          data: {
            accountBookId: bookId,
            name: "Book",
            referenceCurrency: "CHF",
            startDate: "2026-01-15",
          },
        }),
      () =>
        transactions.createSimpleTransaction({
          data: {
            accountBookId: bookId,
            accountId: asset.id,
            counterAccountId: income.id,
            date: "2026-01-12",
            description: "Salary",
            amount: 100,
            direction: "DEBIT",
          },
        }),
    );
    expectRejected(outcomes, "before account book start date");
    expect(await db.transaction.count()).toBe(0);
  });

  it("rejects a start-date change after a concurrent earlier booking commits", async () => {
    const source = await mutations.createAccount({ data: account("Source") });
    const target = await mutations.createAccount({ data: account("Target") });
    const outcomes = await race(
      () =>
        transactions.createTransaction({
          data: {
            accountBookId: bookId,
            description: "Transfer",
            bookings: [source.id, target.id].map((accountId, index) => ({
              accountId,
              date: "2026-01-12",
              description: "",
              unit: Unit.CURRENCY,
              currency: "CHF",
              value: index === 0 ? 100 : -100,
            })),
          },
        }),
      () =>
        settings.updateAccountBookSettings({
          data: {
            accountBookId: bookId,
            name: "Book",
            referenceCurrency: "CHF",
            startDate: "2026-01-15",
          },
        }),
    );
    expectRejected(outcomes, "after first non-opening booking date");
    expect(
      (
        await db.accountBook.findUniqueOrThrow({ where: { id: bookId } })
      ).startDate.toISOString(),
    ).toBe("2026-01-01T00:00:00.000Z");
    expect(await db.transaction.count()).toBe(1);
  });
});
