import { createId } from "@paralleldrive/cuid2";
import { expect, test } from "@playwright/test";
import type { Prisma } from "../../src/.prisma-client/client";
import { AccountType, AssetClass, Unit } from "../../src/.prisma-client/enums";
import { withDatabaseConflictRetry } from "../../src/server/database-conflict-retry";
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

test("classification changes advance only the owning book revision and roll back atomically", async () => {
  const before = await revision();
  const otherBefore = await revision(otherBookId);
  await prisma.account.update({
    where: { id_accountBookId: { id: accountId, accountBookId: bookId } },
    data: { assetClass: AssetClass.EQUITIES },
  });
  const committed = await revision();
  expect(committed).not.toBe(before);
  expect(await revision(otherBookId)).toBe(otherBefore);
  await expect(
    prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id_accountBookId: { id: accountId, accountBookId: bookId } },
        data: { assetClass: null },
      });
      expect(await revision(bookId, tx)).not.toBe(committed);
      throw new Error("Rollback classification");
    }),
  ).rejects.toThrow("Rollback classification");
  expect(await revision()).toBe(committed);
  expect(
    (
      await prisma.account.findUniqueOrThrow({
        where: { id_accountBookId: { id: accountId, accountBookId: bookId } },
      })
    ).assetClass,
  ).toBe(AssetClass.EQUITIES);
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function backendPid(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ pid: number }[]>`
    SELECT pg_backend_pid() AS pid
  `;
  return row!.pid;
}

async function waitUntilBlocked(waitingPid: number, blockingPid: number) {
  await expect
    .poll(async () => {
      const [row] = await prisma.$queryRaw<{ blocked: boolean }[]>`
        SELECT ${blockingPid} = ANY(pg_blocking_pids(${waitingPid})) AS blocked
      `;
      return row!.blocked;
    })
    .toBe(true);
}

for (const victim of ["multi-row", "single-row"] as const) {
  test(`retries ${victim} mutation after a book/child deadlock without partial writes`, async () => {
    const secondAccount = await prisma.account.create({
      data: {
        accountBookId: bookId,
        name: "Second account",
        type: AccountType.ASSET,
        unit: Unit.CURRENCY,
        currency: "CHF",
      },
    });
    const originalRevision = await revision();
    const firstWritten = deferred<void>();
    const secondLocked = deferred<void>();
    const multiPid = deferred<number>();
    const singlePid = deferred<number>();
    const continueMulti = deferred<void>();
    const continueSingle = deferred<void>();
    let multiAttempts = 0;
    let singleAttempts = 0;
    let rolledBackValue: number | string | null = null;
    let rolledBackRevision: string | undefined;

    const multi = withDatabaseConflictRetry(async () => {
      const attempt = ++multiAttempts;
      try {
        return await prisma.$transaction(
          async (tx) => {
            // Only the chosen victim starts its short detector once the cycle
            // exists. The other connection may wait while we establish it.
            if (victim === "multi-row") {
              await tx.$executeRaw`SET LOCAL deadlock_timeout = '1s'`;
            } else {
              await tx.$executeRaw`SET LOCAL deadlock_timeout = '30s'`;
            }
            if (attempt === 1) multiPid.resolve(await backendPid(tx));
            await tx.account.update({
              where: {
                id_accountBookId: { id: accountId, accountBookId: bookId },
              },
              data: { sortOrder: 11 },
            });
            if (attempt === 1) {
              rolledBackRevision = await revision(bookId, tx);
              firstWritten.resolve();
              await continueMulti.promise;
            }
            await tx.account.update({
              where: {
                id_accountBookId: {
                  id: secondAccount.id,
                  accountBookId: bookId,
                },
              },
              data: { sortOrder: 22 },
            });
            return revision(bookId, tx);
          },
          { timeout: 30_000 },
        );
      } catch (error) {
        if (victim === "multi-row" && attempt === 1) {
          const account = await prisma.account.findUniqueOrThrow({
            where: {
              id_accountBookId: { id: accountId, accountBookId: bookId },
            },
          });
          rolledBackValue = account.sortOrder;
        }
        throw error;
      }
    });
    // Observe rejection while coordinating the first transaction, too.
    let outcomes: Promise<PromiseSettledResult<string>[]> = Promise.allSettled([
      multi,
    ]);
    try {
      await Promise.race([firstWritten.promise, multi]);
      const single = withDatabaseConflictRetry(async () => {
        const attempt = ++singleAttempts;
        try {
          return await prisma.$transaction(
            async (tx) => {
              if (victim === "single-row") {
                await tx.$executeRaw`SET LOCAL deadlock_timeout = '1s'`;
              } else {
                await tx.$executeRaw`SET LOCAL deadlock_timeout = '30s'`;
              }
              if (attempt === 1) {
                singlePid.resolve(await backendPid(tx));
                await tx.$queryRaw`
                  SELECT "id" FROM "Account"
                  WHERE "id" = ${secondAccount.id} AND "accountBookId" = ${bookId}
                  FOR UPDATE
                `;
                secondLocked.resolve();
                await continueSingle.promise;
              }
              await tx.account.update({
                where: {
                  id_accountBookId: {
                    id: secondAccount.id,
                    accountBookId: bookId,
                  },
                },
                data: { name: "Edited concurrently" },
              });
              return revision(bookId, tx);
            },
            { timeout: 30_000 },
          );
        } catch (error) {
          if (victim === "single-row" && attempt === 1) {
            const account = await prisma.account.findUniqueOrThrow({
              where: {
                id_accountBookId: {
                  id: secondAccount.id,
                  accountBookId: bookId,
                },
              },
            });
            rolledBackValue = account.name;
          }
          throw error;
        }
      });
      outcomes = Promise.allSettled([multi, single]);
      await Promise.race([secondLocked.promise, single]);
      const [multiBackend, singleBackend] = await Promise.all([
        multiPid.promise,
        singlePid.promise,
      ]);
      if (victim === "multi-row") {
        continueSingle.resolve();
        await waitUntilBlocked(singleBackend, multiBackend);
        continueMulti.resolve();
      } else {
        continueMulti.resolve();
        await waitUntilBlocked(multiBackend, singleBackend);
        continueSingle.resolve();
      }

      const committed = await Promise.all([multi, single]);
      expect(multiAttempts).toBe(victim === "multi-row" ? 2 : 1);
      expect(singleAttempts).toBe(victim === "single-row" ? 2 : 1);
      expect(rolledBackValue).toBe(
        victim === "multi-row" ? null : "Second account",
      );
      const [first, second] = await Promise.all([
        prisma.account.findUniqueOrThrow({
          where: { id_accountBookId: { id: accountId, accountBookId: bookId } },
        }),
        prisma.account.findUniqueOrThrow({
          where: {
            id_accountBookId: { id: secondAccount.id, accountBookId: bookId },
          },
        }),
      ]);
      expect(first.sortOrder).toBe(11);
      expect(second.sortOrder).toBe(22);
      expect(second.name).toBe("Edited concurrently");
      expect(new Set(committed).size).toBe(2);
      const finalRevision = await revision();
      expect(committed).toContain(finalRevision);
      expect(finalRevision).not.toBe(originalRevision);
      if (victim === "multi-row")
        expect(finalRevision).not.toBe(rolledBackRevision);
    } finally {
      continueMulti.resolve();
      continueSingle.resolve();
      await outcomes;
    }
  });
}
