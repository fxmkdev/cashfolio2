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
import { EquityAccountSubtype, UserRole } from "../.prisma-client/enums";
import type { ApprovedSeedTarget } from "./target";
import { generateStagingDataset } from "./dataset";
import { replaceStagingData } from "./writer";

const run = promisify(execFile);
const applicationTables = [
  "Booking",
  "Transaction",
  "Account",
  "AccountGroup",
  "UserAccountBookLink",
  "AccountBook",
  "User",
] as const;

// No generic DATABASE_URL fallback: this suite creates and destroys a database.
// The admin connection must explicitly point to the local postgres maintenance DB.
const adminUrl = new URL(
  process.env.STAGING_SEED_TEST_ADMIN_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5433/postgres",
);
if (
  !["postgresql:", "postgres:"].includes(adminUrl.protocol) ||
  !["127.0.0.1", "localhost", "postgres"].includes(adminUrl.hostname) ||
  adminUrl.pathname !== "/postgres" ||
  [...adminUrl.searchParams.keys()].some((key) => key !== "schema")
) {
  throw new Error(
    "STAGING_SEED_TEST_ADMIN_DATABASE_URL must target a local postgres maintenance database without routing options.",
  );
}

const suffix = randomUUID().replaceAll("-", "");
const databaseName = `staging_seed_test_${suffix}`;
const roleName = `staging_seed_test_${suffix}`;
const rolePassword = randomUUID().replaceAll("-", "");
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
const seedUrl = new URL(databaseUrl);
seedUrl.username = roleName;
seedUrl.password = rolePassword;

function client(connectionString: string) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

const admin = client(adminUrl.href);
const fixture = client(databaseUrl.href);
const seed = client(seedUrl.href);
const target: ApprovedSeedTarget = {
  hostname: adminUrl.hostname,
  projectId: "staging-seed-test-project",
  branchId: "staging-seed-test-branch",
  endpointId: "staging-seed-test-endpoint",
  database: databaseName,
  role: roleName,
};
const testerExternalIds = [
  "staging-seed-existing-admin",
  "staging-seed-new-tester",
];
const dataset = generateStagingDataset(new Date("2026-10-10T00:00:00Z"));
const config = { target, testerExternalIds };
let databaseCreated = false;
let roleCreated = false;

async function snapshot() {
  const [users, books, links, groups, accounts, transactions, bookings] =
    await Promise.all([
      fixture.user.findMany({ orderBy: { id: "asc" } }),
      fixture.accountBook.findMany({ orderBy: { id: "asc" } }),
      fixture.userAccountBookLink.findMany({
        orderBy: [{ userId: "asc" }, { accountBookId: "asc" }],
      }),
      fixture.accountGroup.findMany({ orderBy: { id: "asc" } }),
      fixture.account.findMany({ orderBy: { id: "asc" } }),
      fixture.transaction.findMany({ orderBy: { id: "asc" } }),
      fixture.booking.findMany({ orderBy: { id: "asc" } }),
    ]);
  return { users, books, links, groups, accounts, transactions, bookings };
}

describe("staging seed against disposable PostgreSQL", () => {
  beforeAll(async () => {
    const [identity] = await admin.$queryRaw<{ database: string }[]>`
      SELECT current_database() AS database
    `;
    if (identity?.database !== "postgres") {
      throw new Error(
        "Admin connection did not reach the local maintenance DB.",
      );
    }

    // Identifiers/passwords below contain only fixed prefixes and generated hex.
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    await admin.$executeRawUnsafe(
      `CREATE ROLE "${roleName}" LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
    );
    roleCreated = true;
    await run("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: databaseUrl.href },
      maxBuffer: 4 * 1024 * 1024,
    });
    for (const [key, value] of [
      ["neon.project_id", target.projectId],
      ["neon.branch_id", target.branchId],
      ["neon.endpoint_id", target.endpointId],
    ]) {
      await admin.$executeRawUnsafe(
        `ALTER DATABASE "${databaseName}" SET "${key}" TO '${value}'`,
      );
    }
    await fixture.$executeRawUnsafe(
      `GRANT CONNECT ON DATABASE "${databaseName}" TO "${roleName}"`,
    );
    await fixture.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA public TO "${roleName}"`,
    );
    await fixture.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ${applicationTables.map((table) => `"${table}"`).join(", ")} TO "${roleName}"`,
    );
  });

  beforeEach(async () => {
    await fixture.$executeRawUnsafe(
      `TRUNCATE ${applicationTables.map((table) => `"${table}"`).join(", ")} CASCADE`,
    );
    await fixture.user.createMany({
      data: [
        {
          id: "existing-admin-id",
          externalId: testerExternalIds[0],
          locale: "de-CH",
          roles: [UserRole.ADMIN],
        },
        { id: "real-identity-id", externalId: "nonconfigured-real-identity" },
      ],
    });
    await fixture.accountBook.create({
      data: {
        id: "legacy-book-id",
        name: "Legacy production-clone book",
        referenceCurrency: "EUR",
        startDate: new Date("2009-01-01T00:00:00Z"),
        userLinks: { create: { userId: "real-identity-id" } },
      },
    });
  });

  afterAll(async () => {
    await Promise.all([seed.$disconnect(), fixture.$disconnect()]);
    if (databaseCreated) {
      await admin.$executeRawUnsafe(
        `DROP DATABASE "${databaseName}" WITH (FORCE)`,
      );
    }
    if (roleCreated) {
      await admin.$executeRawUnsafe(`DROP ROLE "${roleName}"`);
    }
    await admin.$disconnect();
  });

  it("replaces legacy data, preserves tester roles/locales, and creates valid shared books using CRUD-only credentials", async () => {
    const existingAdmin = await fixture.user.findUniqueOrThrow({
      where: { externalId: testerExternalIds[0] },
    });
    const summary = await replaceStagingData(seed, config, dataset);
    const current = await snapshot();

    expect(current.users).toHaveLength(2);
    expect(current.users).toContainEqual(existingAdmin);
    expect(current.users).toContainEqual(
      expect.objectContaining({
        externalId: testerExternalIds[1],
        locale: "en-CH",
        roles: [],
      }),
    );
    expect(current.books.map((book) => book.name).sort()).toEqual(
      ["Swiss Household Demo", "Valuation Edge Cases", "Empty Demo"].sort(),
    );
    expect(
      current.books.every((book) => book.referenceCurrency === "CHF"),
    ).toBe(true);
    expect(current.links).toHaveLength(6);
    expect(
      current.accounts.filter(
        (account) =>
          account.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS,
      ),
    ).toHaveLength(3);
    expect(current.books.some((book) => book.id === "legacy-book-id")).toBe(
      false,
    );
    expect(current.bookings.length).toBe(
      summary.books.reduce((total, book) => total + book.bookings, 0),
    );
    expect(current.transactions.length).toBe(
      summary.books.reduce((total, book) => total + book.transactions, 0),
    );
    expect(current.accounts.length).toBe(
      summary.books.reduce((total, book) => total + book.accounts, 0),
    );
    expect(
      current.bookings.some((booking) =>
        booking.date.toISOString().startsWith("2026-10-10"),
      ),
    ).toBe(true);
    const [privileges] = await seed.$queryRaw<
      { superuser: boolean; createRole: boolean; createDatabase: boolean }[]
    >`
      SELECT rolsuper AS superuser, rolcreaterole AS "createRole",
        rolcreatedb AS "createDatabase"
      FROM pg_roles WHERE rolname = current_user
    `;
    expect(privileges).toEqual({
      superuser: false,
      createRole: false,
      createDatabase: false,
    });
  });

  it("refuses replacement when the configured testers omit the existing administrator", async () => {
    const initial = await snapshot();
    await expect(
      replaceStagingData(
        seed,
        {
          ...config,
          testerExternalIds: [testerExternalIds[1]],
        },
        dataset,
      ),
    ).rejects.toThrow("existing staging administrator");
    expect(await snapshot()).toEqual(initial);
  });

  it("restores equivalent row counts without duplicates and refreshes all financial IDs", async () => {
    const firstSummary = await replaceStagingData(seed, config, dataset);
    const first = await snapshot();
    const secondSummary = await replaceStagingData(seed, config, dataset);
    const second = await snapshot();

    for (const table of [
      "books",
      "groups",
      "accounts",
      "transactions",
      "bookings",
    ] as const) {
      expect(second[table]).toHaveLength(first[table].length);
      const previousIds = new Set(first[table].map((row) => row.id));
      expect(second[table].some((row) => previousIds.has(row.id))).toBe(false);
    }
    expect(second.links).toHaveLength(first.links.length);
    expect(second.users).toEqual(first.users);
    expect(secondSummary.books.map(({ id: _id, ...book }) => book)).toEqual(
      firstSummary.books.map(({ id: _id, ...book }) => book),
    );
    expect(secondSummary.from).toBe(firstSummary.from);
    expect(secondSummary.through).toBe(firstSummary.through);
  });

  it("performs zero write attempts for every destination identity mismatch", async () => {
    await replaceStagingData(seed, config, dataset);
    const initial = await snapshot();
    await fixture.$executeRawUnsafe(
      "CREATE SEQUENCE staging_seed_test_write_attempts",
    );
    await fixture.$executeRawUnsafe(
      `GRANT USAGE ON SEQUENCE staging_seed_test_write_attempts TO "${roleName}"`,
    );
    await fixture.$executeRawUnsafe(`
      CREATE FUNCTION staging_seed_test_audit_write() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        PERFORM nextval('staging_seed_test_write_attempts');
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$
    `);
    for (const table of applicationTables) {
      await fixture.$executeRawUnsafe(`
        CREATE TRIGGER staging_seed_test_audit_write
        BEFORE INSERT OR UPDATE OR DELETE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION staging_seed_test_audit_write()
      `);
    }
    try {
      for (const key of [
        "projectId",
        "branchId",
        "endpointId",
        "database",
        "role",
      ] as const) {
        await expect(
          replaceStagingData(
            seed,
            {
              ...config,
              target: { ...target, [key]: "production-destination" },
            },
            dataset,
          ),
        ).rejects.toThrow();
      }
      await admin.$executeRawUnsafe(
        `ALTER DATABASE "${databaseName}" RESET "neon.project_id"`,
      );
      await seed.$disconnect();
      await expect(replaceStagingData(seed, config, dataset)).rejects.toThrow();
      // Sequences are not rolled back, so this also detects attempted writes that
      // a failed transaction would otherwise hide from ordinary row snapshots.
      expect(
        await fixture.$queryRawUnsafe<{ is_called: boolean }[]>(
          "SELECT is_called FROM staging_seed_test_write_attempts",
        ),
      ).toEqual([{ is_called: false }]);
      expect(await snapshot()).toEqual(initial);
    } finally {
      await admin.$executeRawUnsafe(
        `ALTER DATABASE "${databaseName}" SET "neon.project_id" TO '${target.projectId}'`,
      );
      await seed.$disconnect();
      for (const table of applicationTables) {
        await fixture.$executeRawUnsafe(
          `DROP TRIGGER staging_seed_test_audit_write ON "${table}"`,
        );
      }
      await fixture.$executeRawUnsafe(
        "DROP FUNCTION staging_seed_test_audit_write()",
      );
      await fixture.$executeRawUnsafe(
        "DROP SEQUENCE staging_seed_test_write_attempts",
      );
    }
  });

  it("rolls back replacement and user removal when an insert fails after deletion", async () => {
    await replaceStagingData(seed, config, dataset);
    await fixture.user.create({
      data: { externalId: "another-retained-until-successful-reset" },
    });
    const initial = await snapshot();
    await fixture.$executeRawUnsafe(`
      CREATE FUNCTION staging_seed_test_reject_booking() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'injected staging-seed booking failure';
      END $$
    `);
    await fixture.$executeRawUnsafe(`
      CREATE TRIGGER staging_seed_test_reject_booking
      BEFORE INSERT ON "Booking" FOR EACH ROW
      EXECUTE FUNCTION staging_seed_test_reject_booking()
    `);
    try {
      await expect(replaceStagingData(seed, config, dataset)).rejects.toThrow(
        "injected staging-seed booking failure",
      );
      expect(await snapshot()).toEqual(initial);
    } finally {
      await fixture.$executeRawUnsafe(
        'DROP TRIGGER staging_seed_test_reject_booking ON "Booking"',
      );
      await fixture.$executeRawUnsafe(
        "DROP FUNCTION staging_seed_test_reject_booking()",
      );
    }
  });

  it("retries a deadlocked reset when an earlier writer locks Booking before mutating", async () => {
    await replaceStagingData(seed, config, dataset);
    const editedTransaction = await fixture.transaction.findFirstOrThrow({
      where: { description: "Coop groceries" },
    });
    const application = client(databaseUrl.href);
    let notifyBookingLocked!: () => void;
    const bookingLocked = new Promise<void>((resolve) => {
      notifyBookingLocked = resolve;
    });
    let resumeEdit!: () => void;
    const waitForEdit = new Promise<void>((resolve) => {
      resumeEdit = resolve;
    });
    const transaction = vi.spyOn(seed, "$transaction");
    let operations: Promise<PromiseSettledResult<unknown>[]> | undefined;
    const applicationEdit = application.$transaction(
      async (tx) => {
        // Let the seed's default 1s detector find the cycle first, so the seed is
        // the victim. This test connection uses the local fixture's admin role.
        await tx.$executeRawUnsafe("SET LOCAL deadlock_timeout = '10s'");
        // A completed booking write now advances the AccountBook revision and
        // would block reset at its first table lock, avoiding this cycle. Hold
        // the booking locks before writing to keep exercising the retry path.
        await tx.$executeRawUnsafe(
          'LOCK TABLE "Booking" IN ROW EXCLUSIVE MODE',
        );
        await tx.$queryRaw`
          SELECT "id" FROM "Booking"
          WHERE "transactionId" = ${editedTransaction.id}
            AND "accountBookId" = ${editedTransaction.accountBookId}
          FOR UPDATE
        `;
        notifyBookingLocked();
        await waitForEdit;
        await tx.booking.deleteMany({
          where: { transactionId: editedTransaction.id },
        });
        return tx.transaction.update({
          where: {
            id_accountBookId: {
              id: editedTransaction.id,
              accountBookId: editedTransaction.accountBookId,
            },
          },
          data: {
            description: "Edited immediately before staging replacement",
          },
        });
      },
      { timeout: 30_000 },
    );
    // Observe rejection immediately even if setup/polling fails before the reset.
    operations = Promise.allSettled([applicationEdit]);
    try {
      await Promise.race([bookingLocked, applicationEdit]);
      const replacement = replaceStagingData(seed, config, dataset);
      operations = Promise.allSettled([applicationEdit, replacement]);
      await expect
        .poll(
          async () => {
            const [locks] = await fixture.$queryRaw<
              { bookingWaiting: boolean; transactionHeld: boolean }[]
            >`
          SELECT
            EXISTS (
              SELECT 1 FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
              JOIN pg_stat_activity a USING (pid)
              WHERE a.usename = ${roleName} AND c.relname = 'Booking'
                AND l.mode = 'ShareRowExclusiveLock' AND NOT l.granted
            ) AS "bookingWaiting",
            EXISTS (
              SELECT 1 FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
              JOIN pg_stat_activity a USING (pid)
              WHERE a.usename = ${roleName} AND c.relname = 'Transaction'
                AND l.mode = 'ShareRowExclusiveLock' AND l.granted
            ) AS "transactionHeld"
        `;
            return locks;
          },
          { timeout: 10_000 },
        )
        .toEqual({ bookingWaiting: true, transactionHeld: true });
      resumeEdit();

      const outcomes = await operations;
      expect(outcomes.map((outcome) => outcome.status)).toEqual([
        "fulfilled",
        "fulfilled",
      ]);
      expect(transaction).toHaveBeenCalledTimes(2);
      await expect(transaction.mock.results[0].value).rejects.toMatchObject({
        code: "P2010",
        meta: { driverAdapterError: { cause: { originalCode: "40P01" } } },
      });
      const summary = await replacement;
      expect(summary.books).toHaveLength(3);
      expect(await fixture.accountBook.count()).toBe(3);
      expect(await fixture.booking.count()).toBe(
        summary.books.reduce((total, book) => total + book.bookings, 0),
      );
      expect(
        await fixture.transaction.findUnique({
          where: {
            id_accountBookId: {
              id: editedTransaction.id,
              accountBookId: editedTransaction.accountBookId,
            },
          },
        }),
      ).toBeNull();
    } finally {
      resumeEdit();
      await operations;
      transaction.mockRestore();
      await application.$disconnect();
    }
  });

  it("blocks concurrent application inserts until the complete replacement commits", async () => {
    const gate = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl.href, max: 1 }),
    });
    const applicationName = `staging_seed_test_application_${suffix}`;
    const application = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl.href,
        application_name: applicationName,
      }),
    });
    let replacement: ReturnType<typeof replaceStagingData> | undefined;
    let insertion:
      ReturnType<typeof application.accountBook.create> | undefined;
    try {
      await gate.$queryRaw`SELECT pg_advisory_lock(216177610, 1)::text`;
      await fixture.$executeRawUnsafe(`
        CREATE FUNCTION staging_seed_test_pause_delete() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
          PERFORM pg_advisory_xact_lock(216177610, 1);
          RETURN OLD;
        END $$
      `);
      await fixture.$executeRawUnsafe(`
        CREATE TRIGGER staging_seed_test_pause_delete
        BEFORE DELETE ON "AccountBook" FOR EACH ROW
        EXECUTE FUNCTION staging_seed_test_pause_delete()
      `);
      replacement = replaceStagingData(seed, config, dataset);
      // Hold reset after deletion has started, while its table locks are live.
      await expect
        .poll(
          async () => {
            const waiting = await fixture.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_locks l JOIN pg_stat_activity a USING (pid)
            WHERE a.usename = ${roleName} AND l.locktype = 'advisory'
              AND NOT l.granted
          ) AS waiting
        `;
            return waiting[0].waiting;
          },
          { timeout: 10_000 },
        )
        .toBe(true);
      const heldLocks = await fixture.$queryRaw<{ table: string }[]>`
        SELECT c.relname AS "table"
        FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
        JOIN pg_stat_activity a USING (pid)
        WHERE a.usename = ${roleName} AND l.mode = 'ShareRowExclusiveLock'
          AND l.granted
        ORDER BY c.relname
      `;
      expect(heldLocks.map((lock) => lock.table)).toEqual(
        [...applicationTables].sort(),
      );

      insertion = application.accountBook.create({
        data: {
          id: "concurrent-application-book",
          name: "Created after the staging reset",
          referenceCurrency: "CHF",
          startDate: dataset.today,
        },
      });
      // Prisma promises are lazy; attaching then starts the insert immediately.
      const applicationInsert = insertion.then((book) => book);
      await expect
        .poll(
          async () => {
            const waiting = await fixture.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
            JOIN pg_stat_activity a USING (pid)
            WHERE a.application_name = ${applicationName}
              AND c.relname = 'AccountBook' AND l.mode = 'RowExclusiveLock'
              AND NOT l.granted
          ) AS waiting
        `;
            return waiting[0].waiting;
          },
          { timeout: 10_000 },
        )
        .toBe(true);
      // Read-only clients remain able to inspect the old committed dataset.
      expect(await fixture.accountBook.count()).toBe(1);
      await gate.$queryRaw`SELECT pg_advisory_unlock(216177610, 1)`;
      const summary = await replacement;
      expect((await applicationInsert).id).toBe("concurrent-application-book");
      expect(summary.books).toHaveLength(3);
      expect(await fixture.accountBook.count()).toBe(4);
      expect(
        await fixture.accountBook.findUnique({
          where: { id: "legacy-book-id" },
        }),
      ).toBeNull();
    } finally {
      await gate.$queryRaw`SELECT pg_advisory_unlock(216177610, 1)`;
      await Promise.allSettled([replacement, insertion]);
      await fixture.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS staging_seed_test_pause_delete ON "AccountBook"',
      );
      await fixture.$executeRawUnsafe(
        "DROP FUNCTION IF EXISTS staging_seed_test_pause_delete()",
      );
      await Promise.all([gate.$disconnect(), application.$disconnect()]);
    }
  });
});
