import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "../.prisma-client/client";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import type { AccountInput } from "./accounts/accounts-types";
import type { CreateTransactionInput } from "./transactions/transactions-types";

// Exercise the public mutation handlers and real DB transactions, with request
// authentication and Redis replaced independently of the accounting operations.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (data: unknown) => unknown = (data) => data;
    const chain = {
      validator: (validator: typeof validate) => {
        validate = validator;
        return chain;
      },
      handler:
        (handler: (args: { data: unknown }) => unknown) =>
        ({ data }: { data: unknown }) =>
          handler({ data: validate(data) }),
    };
    return chain;
  },
}));
vi.mock("./mutation-guard.server", () => ({
  ensureAuthorizedAccountBookMutation: vi.fn(),
}));
vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId: vi.fn(),
}));
vi.mock("../security/same-origin.server", () => ({
  ensureSameOriginRequestFromServerContext: vi.fn(),
}));
vi.mock("./period/cache/period-base-data-cache", () => ({
  invalidatePeriodBaseDataCacheForAccountBook: vi.fn(),
}));

const run = promisify(execFile);
// Never use DATABASE_URL: create/drop only a disposable DB on local PostgreSQL.
const adminUrl = new URL(
  process.env.MUTATION_TEST_ADMIN_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5433/postgres",
);
if (
  !["postgresql:", "postgres:"].includes(adminUrl.protocol) ||
  !["127.0.0.1", "localhost", "postgres"].includes(adminUrl.hostname) ||
  adminUrl.pathname !== "/postgres" ||
  [...adminUrl.searchParams.keys()].some((key) => key !== "schema")
) {
  throw new Error(
    "MUTATION_TEST_ADMIN_DATABASE_URL must target a local postgres maintenance database without routing options.",
  );
}
const databaseName = `mutation_test_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl.href }),
});
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl.href }),
});
let databaseCreated = false;
let applicationDb: PrismaClient | undefined;
let mutations: typeof import("./accounts/accounts-mutations");
let organize: typeof import("./accounts/organize");
let transactions: typeof import("./transactions/transactions-mutations");
let settings: typeof import("./accounts/account-book-settings");
let boundary: typeof import("./account-book-mutation.server");

const bookId = "book-1";
function account(
  name: string,
  overrides: Partial<AccountInput> = {},
): AccountInput {
  return {
    accountBookId: bookId,
    name,
    type: AccountType.BALANCE,
    unit: Unit.CURRENCY,
    currency: "CHF",
    ...overrides,
  };
}
function groupUpdate(id: string, parentGroupId?: string) {
  return {
    data: {
      accountBookId: bookId,
      id,
      name: id,
      type: AccountType.BALANCE,
      parentGroupId,
    },
  };
}

/** Pause the first writer after its lock, and observe the second waiting in PG. */
async function race(
  first: () => Promise<unknown>,
  second: () => Promise<unknown>,
) {
  let locked!: () => void;
  const lockAcquired = new Promise<void>((resolve) => {
    locked = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = boundary.withAccountBookMutation;
  const spy = vi
    .spyOn(boundary, "withAccountBookMutation")
    .mockImplementationOnce((id, operation) =>
      original(id, async (tx) => {
        locked();
        await gate;
        return operation(tx);
      }),
    );
  const firstResult = first();
  let outcomes: Promise<PromiseSettledResult<unknown>[]> = Promise.allSettled([
    firstResult,
  ]);
  try {
    await Promise.race([lockAcquired, firstResult]);
    const secondResult = second();
    outcomes = Promise.allSettled([firstResult, secondResult]);
    await expect
      .poll(
        async () => {
          const [result] = await db.$queryRaw<{ waiting: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query LIKE '%AccountBook%FOR UPDATE%'
        ) AS waiting
      `;
          return result.waiting;
        },
        { timeout: 10_000 },
      )
      .toBe(true);
    release();
    return await outcomes;
  } finally {
    release();
    await outcomes;
    spy.mockRestore();
  }
}

function expectRejected(
  outcomes: PromiseSettledResult<unknown>[],
  message: string,
) {
  expect(outcomes[0].status).toBe("fulfilled");
  expect(outcomes[1].status).toBe("rejected");
  if (outcomes[1].status === "rejected") {
    expect(outcomes[1].reason.message).toContain(message);
  }
}

describe("account-book mutation invariants against disposable PostgreSQL", () => {
  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    await run("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: databaseUrl.href },
      maxBuffer: 4 * 1024 * 1024,
    });
    process.env.DATABASE_URL = databaseUrl.href;
    applicationDb = (await import("../prisma.server")).prisma;
    boundary = await import("./account-book-mutation.server");
    mutations = await import("./accounts/accounts-mutations");
    organize = await import("./accounts/organize");
    transactions = await import("./transactions/transactions-mutations");
    settings = await import("./accounts/account-book-settings");
  });
  beforeEach(async () => {
    await db.accountBook.deleteMany();
    await db.accountBook.create({
      data: {
        id: bookId,
        name: "Book",
        referenceCurrency: "CHF",
        startDate: new Date("2026-01-01T00:00:00Z"),
      },
    });
    await db.accountGroup.createMany({
      data: ["A", "B"].map((id) => ({
        id,
        name: id,
        accountBookId: bookId,
        type: AccountType.BALANCE,
      })),
    });
  });
  afterAll(async () => {
    await Promise.all([db.$disconnect(), applicationDb?.$disconnect()]);
    if (databaseCreated)
      await admin.$executeRawUnsafe(
        `DROP DATABASE "${databaseName}" WITH (FORCE)`,
      );
    await admin.$disconnect();
  });

  it("serializes competing organize moves and rejects the stale hierarchy", async () => {
    const snapshot = await organize.getAccountOrganizeData({
      data: { accountBookId: bookId },
    });
    const move = (id: string, parentId: string) =>
      organize.moveAccountTreeItems({
        data: {
          accountBookId: bookId,
          version: snapshot.version,
          items: [{ id, nodeType: "accountGroup" }],
          parentId,
          placement: "last",
        },
      });
    const outcomes = await race(
      () => move("A", "B"),
      () => move("B", "A"),
    );
    expectRejected(outcomes, "hierarchy changed");
    expect(
      (
        await db.accountGroup.findUniqueOrThrow({
          where: { id_accountBookId: { id: "A", accountBookId: bookId } },
        })
      ).parentGroupId,
    ).toBe("B");
  });

  it("rejects an Undo after a concurrent group edit without replacing the newer state", async () => {
    const snapshot = await organize.getAccountOrganizeData({
      data: { accountBookId: bookId },
    });
    const moved = await organize.moveAccountTreeItems({
      data: {
        accountBookId: bookId,
        version: snapshot.version,
        items: [{ id: "A", nodeType: "accountGroup" }],
        parentId: "B",
        placement: "last",
      },
    });
    const outcomes = await race(
      () =>
        mutations.updateAccountGroup({
          data: { ...groupUpdate("B").data, name: "Renamed B" },
        }),
      () =>
        organize.undoAccountTreeMove({
          data: { accountBookId: bookId, undo: moved.undo! },
        }),
    );
    expectRejected(outcomes, "hierarchy changed");
    const groups = await db.accountGroup.findMany({
      where: { accountBookId: bookId },
    });
    expect(groups.find((group) => group.id === "A")?.parentGroupId).toBe("B");
    expect(groups.find((group) => group.id === "B")?.name).toBe("Renamed B");
  });

  it("rolls back organize cash propagation, parent/order changes and cache revision on a later database failure", async () => {
    await mutations.createAccount({ data: account("Child", { groupId: "A" }) });
    await db.accountGroup.update({
      where: { id_accountBookId: { id: "B", accountBookId: bookId } },
      data: { isCashAccount: true },
    });
    const snapshot = await organize.getAccountOrganizeData({
      data: { accountBookId: bookId },
    });
    const revision = (
      await db.accountBook.findUniqueOrThrow({ where: { id: bookId } })
    ).periodCacheRevision;
    await db.$executeRawUnsafe(
      `CREATE FUNCTION reject_organize_update() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'organize write rejected'; END; $$ LANGUAGE plpgsql`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER reject_organize_update BEFORE UPDATE ON "AccountGroup" FOR EACH ROW WHEN (NEW.id = 'A') EXECUTE FUNCTION reject_organize_update()`,
    );
    try {
      await expect(
        organize.moveAccountTreeItems({
          data: {
            accountBookId: bookId,
            version: snapshot.version,
            items: [{ id: "A", nodeType: "accountGroup" }],
            parentId: "B",
            placement: "last",
          },
        }),
      ).rejects.toThrow("organize write rejected");
      expect(
        await organize.getAccountOrganizeData({
          data: { accountBookId: bookId },
        }),
      ).toEqual(snapshot);
      expect(
        (await db.accountBook.findUniqueOrThrow({ where: { id: bookId } }))
          .periodCacheRevision,
      ).toBe(revision);
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER reject_organize_update ON "AccountGroup"`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION reject_organize_update()`);
    }
  });

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

  it("rejects simultaneous opposite group moves instead of committing a cycle", async () => {
    const outcomes = await race(
      () => mutations.updateAccountGroup(groupUpdate("A", "B")),
      () => mutations.updateAccountGroup(groupUpdate("B", "A")),
    );
    expectRejected(outcomes, "sub-groups");
    const groups = await db.accountGroup.findMany({ orderBy: { id: "asc" } });
    expect(groups.map((group) => [group.id, group.parentGroupId])).toEqual([
      ["A", "B"],
      ["B", null],
    ]);
  });

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
      const mutation = mutations.reorderAccountTreeItems({
        data: {
          accountBookId: bookId,
          updates: [free.id, locked.id].map((id, sortOrder) => ({
            id,
            nodeType: "account" as const,
            sortOrder,
          })),
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
      expect(saved.map((row) => [row.id, row.sortOrder])).toEqual([
        [free.id, 0],
        [locked.id, 1],
      ]);
      expect(saved[1].name).toBe("External writer");
    } finally {
      releaseHolder();
      await results;
      spy.mockRestore();
    }
  });
});
