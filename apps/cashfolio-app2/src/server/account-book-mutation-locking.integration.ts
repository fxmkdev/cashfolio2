import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AccountType, Unit } from "../.prisma-client/enums";
import {
  account,
  bookId,
  boundary,
  createMutationDatabase,
  db,
  disposeMutationDatabase,
  mutations,
  resetMutationDatabase,
} from "./account-book-mutation.test-support";

describe("account-book mutation invariants against disposable PostgreSQL", () => {
  beforeAll(createMutationDatabase);
  beforeEach(resetMutationDatabase);
  afterAll(disposeMutationDatabase);

  it("rolls back a 25-second lock wait and allows an explicit retry", async () => {
    let acquired!: () => void;
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "AccountBook" WHERE id = ${bookId} FOR UPDATE`;
        acquired();
        await gate;
      },
      { timeout: 60_000 },
    );
    const write = vi.fn();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await locked;
      const before = await db.account.count();
      const start = Date.now();
      const rejected = boundary.withAccountBookMutation(bookId, async (tx) => {
        write();
        return tx.account.create({
          data: {
            id: "retry-account",
            name: "Retry",
            accountBookId: bookId,
            type: AccountType.BALANCE,
            unit: Unit.CURRENCY,
            currency: "CHF",
          },
        });
      });
      await expect(
        Promise.race([
          rejected,
          new Promise((_, reject) => {
            deadline = setTimeout(
              () => reject(new Error("Lock wait exceeded its deadline")),
              32_000,
            );
          }),
        ]),
      ).rejects.toThrow(
        "This account book is busy. No changes were saved. Please try again.",
      );
      expect(Date.now() - start).toBeGreaterThanOrEqual(24_000);
      expect(write).not.toHaveBeenCalled();
      expect(await db.account.count()).toBe(before);
    } finally {
      clearTimeout(deadline);
      release();
      await holder;
    }
    await mutations.createAccount({ data: account("Retry") });
    expect(await db.account.count({ where: { name: "Retry" } })).toBe(1);
  }, 45_000);

  it("does not serialize independent account books", async () => {
    const otherBookId = "other-book";
    await db.accountBook.create({
      data: {
        id: otherBookId,
        name: "Other",
        referenceCurrency: "CHF",
        startDate: new Date("2026-01-01T00:00:00Z"),
      },
    });
    let locked!: () => void;
    const lockAcquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = boundary.withAccountBookMutation(bookId, async () => {
      locked();
      await gate;
    });
    const settled = Promise.allSettled([held]);
    try {
      await Promise.race([lockAcquired, held]);
      const created = await mutations.createAccount({
        data: account("Independent", { accountBookId: otherBookId }),
      });
      expect(created.accountBookId).toBe(otherBookId);
    } finally {
      release();
      await settled;
    }
    await held;
  });

  it("retries the locked public mutation after a cache-trigger book/child deadlock", async () => {
    const free = await mutations.createAccount({ data: account("Free") });
    const locked = await mutations.createAccount({ data: account("Locked") });
    let notifyChildLocked!: () => void;
    const childLocked = new Promise<void>((resolve) => {
      notifyChildLocked = resolve;
    });
    let releaseHolder!: () => void;
    const continueHolder = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    const holder = db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL deadlock_timeout = '10s'`;
        await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${locked.id} FOR UPDATE`;
        notifyChildLocked();
        await continueHolder;
        // Main's revision trigger now waits for the application-held book lock.
        await tx.account.update({
          where: { id_accountBookId: { id: locked.id, accountBookId: bookId } },
          data: { name: "External writer" },
        });
      },
      { timeout: 30_000 },
    );
    let results: Promise<PromiseSettledResult<unknown>[]> = Promise.allSettled([
      holder,
    ]);
    const original = boundary.withAccountBookMutation;
    const spy = vi
      .spyOn(boundary, "withAccountBookMutation")
      .mockImplementation((id, operation) =>
        original(id, async (tx) => {
          // Select the application writer as victim so its public retry is tested.
          await tx.$executeRaw`SET LOCAL deadlock_timeout = '100ms'`;
          return operation(tx);
        }),
      );
    try {
      await Promise.race([childLocked, holder]);
      const mutation = mutations.setAccountsTrackingMethod({
        data: {
          accountBookId: bookId,
          accountIds: [free.id, locked.id],
          trackingMethod: "TOTAL_PORTFOLIO_VALUE",
        },
      });
      results = Promise.allSettled([holder, mutation]);
      await expect
        .poll(async () => {
          const [row] = await db.$queryRaw<
            { waiting: boolean }[]
          >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%UPDATE%"Account"%') AS waiting`;
          return row.waiting;
        })
        .toBe(true);
      releaseHolder();
      expect((await results).map((result) => result.status)).toEqual([
        "fulfilled",
        "fulfilled",
      ]);
      expect(spy).toHaveBeenCalledTimes(2);
      const saved = await db.account.findMany({
        where: { id: { in: [free.id, locked.id] }, accountBookId: bookId },
        orderBy: { sortOrder: "asc" },
      });
      expect(saved.map((row) => row.trackingMethod)).toEqual([
        "TOTAL_PORTFOLIO_VALUE",
        "TOTAL_PORTFOLIO_VALUE",
      ]);
      expect(saved.find((row) => row.id === locked.id)?.name).toBe(
        "External writer",
      );
    } finally {
      releaseHolder();
      await results;
      spy.mockRestore();
    }
  });
});
