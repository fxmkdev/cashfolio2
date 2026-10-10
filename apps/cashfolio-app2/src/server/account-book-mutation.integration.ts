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

// Exercise the public mutation handlers and real DB transactions, with request
// authentication and Redis replaced independently of the accounting operations.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (data: unknown) => unknown = (data) => data;
    const chain = {
      inputValidator: (validator: typeof validate) => {
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
vi.mock("./period/period-base-data-cache", () => ({
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
    type: AccountType.ASSET,
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
      type: AccountType.ASSET,
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
        type: AccountType.ASSET,
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
    expect(await db.account.count({ where: { type: AccountType.ASSET } })).toBe(
      1,
    );
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
    expectRejected(outcomes, "currency asset accounts");
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

  it("rolls back earlier account writes when opening-balance validation fails", async () => {
    await expect(
      mutations.createAccount({
        data: account("Wallet", { openingBalance: NaN }),
      }),
    ).rejects.toThrow("Opening balance is invalid");
    expect(await db.account.count({ where: { type: AccountType.ASSET } })).toBe(
      0,
    );
    // A failed mutation releases the lock so the next writer can proceed.
    await mutations.createAccount({
      data: account("Wallet", { openingBalance: 10 }),
    });
    expect(await db.transaction.count()).toBe(1);
  });

  it.each(["archive", "rebook"] as const)(
    "protects account balance and target status when %s wins the lock",
    async (first) => {
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
        transactions.rebookBooking({
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
});
