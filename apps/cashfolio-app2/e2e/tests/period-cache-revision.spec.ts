import { createId } from "@paralleldrive/cuid2";
import { expect, test } from "@playwright/test";
import type { Prisma } from "../../src/.prisma-client/client";
import { AccountType, Unit } from "../../src/.prisma-client/enums";
import { prisma } from "../support/db-client";

let bookId: string;
let otherBookId: string;
let accountId: string;
let transactionId: string;

async function revision(id = bookId, db: Prisma.TransactionClient = prisma) {
  const book = await db.accountBook.findUniqueOrThrow({
    where: { id },
    select: { periodCacheRevision: true },
  });
  return book.periodCacheRevision;
}

function booking(id = createId()) {
  return {
    id,
    accountBookId: bookId,
    accountId,
    transactionId,
    date: new Date("2026-04-10T00:00:00Z"),
    description: "Cache revision fixture",
    unit: Unit.CURRENCY,
    currency: "CHF",
    value: 10,
  };
}

test.beforeEach(async () => {
  bookId = createId();
  otherBookId = createId();
  accountId = createId();
  transactionId = createId();
  await prisma.accountBook.createMany({
    data: [bookId, otherBookId].map((id) => ({
      id,
      name: "Cache revision test book",
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01T00:00:00Z"),
    })),
  });
  await prisma.account.create({
    data: {
      id: accountId,
      accountBookId: bookId,
      name: "Cash",
      type: AccountType.ASSET,
      unit: Unit.CURRENCY,
      currency: "CHF",
    },
  });
  await prisma.transaction.create({
    data: { id: transactionId, accountBookId: bookId, description: "Fixture" },
  });
});

test.afterEach(async () => {
  await prisma.accountBook.deleteMany({
    where: { id: { in: [bookId, otherBookId] } },
  });
});

const mutations = [
  {
    table: "AccountGroup",
    create: (id: string) =>
      prisma.accountGroup.create({
        data: {
          id,
          accountBookId: bookId,
          name: "Assets",
          type: AccountType.ASSET,
        },
      }),
    update: (id: string) =>
      prisma.accountGroup.update({
        where: { id_accountBookId: { id, accountBookId: bookId } },
        data: { name: "Renamed" },
      }),
    remove: (id: string) =>
      prisma.accountGroup.delete({
        where: { id_accountBookId: { id, accountBookId: bookId } },
      }),
  },
  {
    table: "Account",
    create: (id: string) =>
      prisma.account.create({
        data: {
          id,
          accountBookId: bookId,
          name: "Cash",
          type: AccountType.ASSET,
          unit: Unit.CURRENCY,
          currency: "CHF",
        },
      }),
    update: (id: string) =>
      prisma.account.update({
        where: { id_accountBookId: { id, accountBookId: bookId } },
        data: { name: "Renamed" },
      }),
    remove: (id: string) =>
      prisma.account.delete({
        where: { id_accountBookId: { id, accountBookId: bookId } },
      }),
  },
  {
    table: "Transaction",
    create: (id: string) =>
      prisma.transaction.create({
        data: { id, accountBookId: bookId, description: "New" },
      }),
    update: (id: string) =>
      prisma.transaction.update({
        where: { id_accountBookId: { id, accountBookId: bookId } },
        data: { description: "Renamed" },
      }),
    remove: (id: string) =>
      prisma.transaction.delete({
        where: { id_accountBookId: { id, accountBookId: bookId } },
      }),
  },
  {
    table: "Booking",
    create: (id: string) => prisma.booking.create({ data: booking(id) }),
    update: (id: string) =>
      prisma.booking.update({
        where: { id_accountBookId: { id, accountBookId: bookId } },
        data: { value: 20 },
      }),
    remove: (id: string) =>
      prisma.booking.delete({
        where: { id_accountBookId: { id, accountBookId: bookId } },
      }),
  },
];

for (const mutation of mutations) {
  test(`${mutation.table} insert/update/delete changes only the affected book revision`, async () => {
    const id = createId();
    const otherRevision = await revision(otherBookId);
    let previous = await revision();
    for (const operation of [
      mutation.create,
      mutation.update,
      mutation.remove,
    ]) {
      await operation(id);
      const current = await revision();
      expect(current).not.toBe(previous);
      expect(await revision(otherBookId)).toBe(otherRevision);
      previous = current;
    }
  });
}

test("settings changes invalidate reports while name-only edits preserve the revision", async () => {
  const original = await revision();
  await prisma.accountBook.update({
    where: { id: bookId },
    data: { name: "Renamed" },
  });
  expect(await revision()).toBe(original);
  await prisma.accountBook.update({
    where: { id: bookId },
    data: { referenceCurrency: "EUR" },
  });
  const currencyRevision = await revision();
  expect(currencyRevision).not.toBe(original);
  await prisma.accountBook.update({
    where: { id: bookId },
    data: { startDate: new Date("2026-02-01T00:00:00Z") },
  });
  expect(await revision()).not.toBe(currencyRevision);
});

test("revision changes are invisible before commit and roll back with failed writes", async () => {
  const original = await revision();
  await expect(
    prisma.$transaction(async (tx) => {
      await tx.booking.create({ data: booking() });
      expect(await revision(bookId, tx)).not.toBe(original);
      expect(await revision()).toBe(original);
      throw new Error("Injected rollback");
    }),
  ).rejects.toThrow("Injected rollback");
  expect(await revision()).toBe(original);
  expect(await prisma.booking.count({ where: { accountBookId: bookId } })).toBe(
    0,
  );
});

test("bulk writes and concurrent commits generate distinct revisions", async () => {
  const original = await revision();
  const ids = [createId(), createId()];
  await prisma.booking.createMany({ data: ids.map((id) => booking(id)) });
  const bulkRevision = await revision();
  expect(bulkRevision).not.toBe(original);
  const committed = await Promise.all(
    ids.map((id, index) =>
      prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id_accountBookId: { id, accountBookId: bookId } },
          data: { value: index + 20 },
        });
        return revision(bookId, tx);
      }),
    ),
  );
  expect(new Set(committed).size).toBe(2);
  expect(committed).not.toContain(bulkRevision);
  expect(committed).toContain(await revision());
  const finalRevision = await revision();
  await prisma.booking.updateMany({
    where: { accountBookId: bookId, id: "nonexistent" },
    data: { value: 0 },
  });
  expect(await revision()).toBe(finalRevision);
});
