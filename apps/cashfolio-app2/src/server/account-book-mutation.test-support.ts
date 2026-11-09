import { execFile } from "node:child_process";

import { randomUUID } from "node:crypto";

import { promisify } from "node:util";

import { PrismaPg } from "@prisma/adapter-pg";

import { expect, vi } from "vitest";

import { PrismaClient } from "../.prisma-client/client";

import { AccountType, Unit } from "../.prisma-client/enums";

import type { AccountInput } from "./accounts/accounts-types";

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

vi.mock("./period/cache/period-base-data-cache.server", () => ({
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

let organize: typeof import("./accounts/organize/handlers");

let transactions: typeof import("./transactions/transactions-mutations");

let settings: typeof import("./accounts/settings/handlers");

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
const createMutationDatabase = async () => {
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
  organize = await import("./accounts/organize/handlers");
  transactions = await import("./transactions/transactions-mutations");
  settings = await import("./accounts/settings/handlers");
};
const resetMutationDatabase = async () => {
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
};
const disposeMutationDatabase = async () => {
  await Promise.all([db.$disconnect(), applicationDb?.$disconnect()]);
  if (databaseCreated)
    await admin.$executeRawUnsafe(
      `DROP DATABASE "${databaseName}" WITH (FORCE)`,
    );
  await admin.$disconnect();
};
export {
  account,
  bookId,
  boundary,
  createMutationDatabase,
  db,
  disposeMutationDatabase,
  expectRejected,
  groupUpdate,
  mutations,
  organize,
  race,
  resetMutationDatabase,
  settings,
  transactions,
};
