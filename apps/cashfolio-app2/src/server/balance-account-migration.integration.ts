import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../.prisma-client/client";

const run = promisify(execFile);
const migration = "20261024120000_unify_balance_account_types";
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
    "Migration tests require a local postgres maintenance database.",
  );
}
const databaseName = `balance_migration_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl.href }),
});
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl.href }),
});
let created = false;
let temporaryDirectory: string | undefined;
let migrationConfig: string | undefined;

async function deploy(config = migrationConfig) {
  await run(
    "pnpm",
    [
      "exec",
      "prisma",
      "migrate",
      "deploy",
      ...(config ? ["--config", config] : []),
    ],
    {
      env: { ...process.env, DATABASE_URL: databaseUrl.href },
      maxBuffer: 4 * 1024 * 1024,
    },
  );
}

type SnapshotRow = Record<string, unknown> & { id: string; type?: string };
async function snapshot() {
  const result: Record<string, SnapshotRow[]> = {};
  for (const table of [
    "AccountBook",
    "AccountGroup",
    "Account",
    "Transaction",
    "Booking",
  ]) {
    // Monetary values are strings so the comparison retains full Decimal precision.
    const expression =
      table === "Booking"
        ? `to_jsonb(t) || jsonb_build_object('value', t."value"::text)`
        : "to_jsonb(t)";
    const rows = await db.$queryRawUnsafe<{ row: SnapshotRow }[]>(
      `SELECT ${expression} AS row FROM "${table}" t ORDER BY t."id"`,
    );
    result[table] = rows.map(({ row }) => row);
  }
  return result;
}

async function seedLegacyData() {
  await db.$executeRawUnsafe(`INSERT INTO "AccountBook" ("id", "name", "referenceCurrency", "startDate", "updatedAt")
    VALUES ('book', 'Legacy Book', 'CHF', '2026-01-01', '2026-01-01'),
           ('empty', 'Empty Book', 'CHF', '2026-01-01', '2026-01-01')`);
  await db.$executeRawUnsafe(`INSERT INTO "AccountGroup"
    ("id", "accountBookId", "name", "type", "parentGroupId", "isActive", "isCashAccount", "sortOrder", "updatedAt") VALUES
    ('asset-group', 'book', 'Everyday', 'ASSET', NULL, true, true, 2, '2026-01-01'),
    ('liability-group', 'book', 'Everyday', 'LIABILITY', NULL, true, false, 1, '2026-01-01'),
    ('mixed-group', 'book', 'Nested', 'LIABILITY', 'asset-group', true, true, 0, '2026-01-01'),
    ('archived-group', 'book', 'Archive', 'ASSET', NULL, false, false, NULL, '2026-01-01')`);
  await db.$executeRawUnsafe(`INSERT INTO "AccountGroup"
    ("id", "accountBookId", "name", "type", "equityAccountSubtype", "updatedAt") VALUES
    ('income-group', 'book', 'Income', 'EQUITY', 'INCOME', '2026-01-01'),
    ('expense-group', 'book', 'Expenses', 'EQUITY', 'EXPENSE', '2026-01-01')`);
  await db.$executeRawUnsafe(`INSERT INTO "Account"
    ("id", "accountBookId", "name", "type", "groupId", "isActive", "isCashAccount", "unit", "currency", "sortOrder", "statementImportCsvFormat", "updatedAt") VALUES
    ('asset', 'book', 'Bank', 'ASSET', 'asset-group', true, true, 'CURRENCY', 'CHF', 2, '{"hasHeader":true,"delimitersToGuess":[","],"columns":["date","amount"]}', '2026-01-01'),
    ('liability', 'book', 'Card', 'LIABILITY', 'mixed-group', true, true, 'CURRENCY', 'CHF', 1, NULL, '2026-01-01'),
    ('cross-type', 'book', 'Savings', 'ASSET', 'liability-group', true, false, 'CURRENCY', 'EUR', NULL, NULL, '2026-01-01'),
    ('archived-asset', 'book', 'Old Bank', 'ASSET', 'archived-group', false, false, 'CURRENCY', 'CHF', NULL, NULL, '2026-01-01'),
    ('archived-liability', 'book', 'Old Loan', 'LIABILITY', NULL, false, false, 'CURRENCY', 'CHF', NULL, NULL, '2026-01-01')`);
  await db.$executeRawUnsafe(`UPDATE "Account" SET "assetClass" = 'CASH_AND_CASH_EQUIVALENTS'
    WHERE "id" IN ('asset', 'archived-asset')`);
  await db.$executeRawUnsafe(`UPDATE "Account" SET "assetClass" = 'OTHER_ASSETS'
    WHERE "id" IN ('liability', 'archived-liability')`);
  await db.$executeRawUnsafe(`INSERT INTO "Account"
    ("id", "accountBookId", "name", "type", "equityAccountSubtype", "groupId", "updatedAt") VALUES
    ('income', 'book', 'Salary', 'EQUITY', 'INCOME', 'income-group', '2026-01-01'),
    ('expense', 'book', 'Groceries', 'EQUITY', 'EXPENSE', 'expense-group', '2026-01-01'),
    ('opening', 'book', 'Opening Balances', 'EQUITY', 'OPENING_BALANCES', NULL, '2026-01-01')`);
  await db.$executeRawUnsafe(`INSERT INTO "Transaction" ("id", "accountBookId", "description", "updatedAt")
    VALUES ('transaction', 'book', 'Precision and signs', '2026-01-01')`);
  await db.$executeRawUnsafe(`INSERT INTO "Booking"
    ("id", "accountBookId", "transactionId", "accountId", "date", "description", "unit", "currency", "value", "sortOrder") VALUES
    ('positive', 'book', 'transaction', 'asset', '2026-02-01', 'Owned', 'CURRENCY', 'CHF', 123.123456789123456789, 0),
    ('negative', 'book', 'transaction', 'liability', '2026-02-01', 'Owed', 'CURRENCY', 'CHF', -123.123456789123456789, 1),
    ('zero', 'book', 'transaction', 'cross-type', '2026-02-01', 'Zero', 'CURRENCY', 'EUR', 0, 2)`);
}

describe("unified balance account migration against disposable PostgreSQL", () => {
  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    created = true;
    temporaryDirectory = await mkdtemp(join(tmpdir(), "balance-migration-"));
    const migrationsPath = join(temporaryDirectory, "migrations");
    for (const entry of await readdir("prisma/migrations")) {
      if (entry === "migration_lock.toml" || entry < migration)
        await cp(
          join("prisma/migrations", entry),
          join(migrationsPath, entry),
          { recursive: true },
        );
    }
    const config = join(temporaryDirectory, "prisma.config.ts");
    migrationConfig = config;
    await writeFile(
      config,
      `export default { schema: ${JSON.stringify(resolve("prisma/schema.prisma"))}, migrations: { path: ${JSON.stringify(migrationsPath)} }, datasource: { url: process.env.DATABASE_URL } };\n`,
    );
    await deploy(config);
    await seedLegacyData();
    await cp(
      join("prisma/migrations", migration),
      join(migrationsPath, migration),
      { recursive: true },
    );
  });

  afterAll(async () => {
    await db.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(
        `DROP DATABASE "${databaseName}" WITH (FORCE)`,
      );
    await admin.$disconnect();
    if (temporaryDirectory)
      await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("rolls back the whole cutover if final cache invalidation fails", async () => {
    const before = await snapshot();
    await db.$executeRawUnsafe(`CREATE FUNCTION "reject_test_revision"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test cutover failure'; END;
      $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER "reject_test_revision"
      BEFORE UPDATE OF "periodCacheRevision" ON "AccountBook"
      FOR EACH ROW EXECUTE FUNCTION "reject_test_revision"()`);
    // Prisma may report the aborted transaction rather than the trigger's error.
    await expect(deploy()).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    expect(
      await db.$queryRawUnsafe(
        `SELECT enum_range(NULL::"AccountType")::text AS values`,
      ),
    ).toEqual([{ values: "{ASSET,LIABILITY,EQUITY}" }]);
    const indexes = await db.$queryRawUnsafe<
      { indexname: string }[]
    >(`SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname IN ('Account_gain_loss_unique_per_book', 'Account_opening_balances_unique_per_book')`);
    expect(indexes).toHaveLength(2);
    await db.$executeRawUnsafe(
      `DROP TRIGGER "reject_test_revision" ON "AccountBook"`,
    );
    await db.$executeRawUnsafe(`DROP FUNCTION "reject_test_revision"()`);
    await run(
      "pnpm",
      [
        "exec",
        "prisma",
        "migrate",
        "resolve",
        "--rolled-back",
        migration,
        "--config",
        migrationConfig!,
      ],
      {
        env: { ...process.env, DATABASE_URL: databaseUrl.href },
        maxBuffer: 4 * 1024 * 1024,
      },
    );
  });

  it("converts only account/group types and cache revisions, preserving all financial data", async () => {
    const before = await snapshot();
    await deploy();
    const after = await snapshot();
    for (const table of ["Account", "AccountGroup"]) {
      expect(after[table]).toEqual(
        before[table].map((row) => ({
          ...row,
          type: row.type === "EQUITY" ? "EQUITY" : "BALANCE",
        })),
      );
    }
    for (const table of ["Transaction", "Booking"])
      expect(after[table]).toEqual(before[table]);
    expect(after.AccountBook).toHaveLength(before.AccountBook.length);
    for (const [index, book] of after.AccountBook.entries()) {
      expect(book.periodCacheRevision).not.toBe(
        before.AccountBook[index].periodCacheRevision,
      );
      expect({ ...book, periodCacheRevision: null }).toEqual({
        ...before.AccountBook[index],
        periodCacheRevision: null,
      });
    }
    expect(
      await db.$queryRawUnsafe(
        `SELECT enum_range(NULL::"AccountType")::text AS values`,
      ),
    ).toEqual([{ values: "{BALANCE,EQUITY}" }]);
    await deploy();
    expect(await snapshot()).toEqual(after);
  });

  it.each(["ASSET", "LIABILITY"])(
    "rejects obsolete %s values in both tables",
    async (type) => {
      for (const table of ["Account", "AccountGroup"]) {
        await expect(
          db.$executeRawUnsafe(
            `UPDATE "${table}" SET "type" = $1::"AccountType" WHERE "accountBookId" = 'book'`,
            type,
          ),
        ).rejects.toThrow();
      }
    },
  );

  it("preserves system-account indexes and new-book Gain/Loss seeding", async () => {
    await db.accountBook.create({
      data: {
        id: "new-book",
        name: "New",
        referenceCurrency: "CHF",
        startDate: new Date("2026-01-01"),
      },
    });
    expect(
      await db.account.count({
        where: {
          accountBookId: "new-book",
          type: "EQUITY",
          equityAccountSubtype: "GAIN_LOSS",
        },
      }),
    ).toBe(1);
    for (const subtype of ["GAIN_LOSS", "OPENING_BALANCES"] as const) {
      await expect(
        db.account.create({
          // This fixture stops at the balance cutover, before later Account columns.
          select: { id: true },

          data: {
            id: `duplicate-${subtype}`,
            accountBookId: "book",
            name: "Duplicate",
            type: "EQUITY",
            equityAccountSubtype: subtype,
          },
        }),
      ).rejects.toThrow();
    }
    await expect(
      db.accountGroup.create({
        data: {
          id: "invalid",
          accountBookId: "book",
          name: "Invalid",
          type: "EQUITY",
          equityAccountSubtype: "GAIN_LOSS",
        },
      }),
    ).rejects.toThrow();
  });

  it("preserves asset classification and enforces its balance-account constraint", async () => {
    // This suite deliberately stops at the balance-account migration. Query its
    // historical column directly rather than using today's classification model.
    const rows = await db.$queryRaw<
      Array<{ type: string; assetClass: string }>
    >`
      SELECT "type"::text AS "type", "assetClass"::text AS "assetClass"
      FROM "Account" WHERE "id" = 'archived-asset' AND "accountBookId" = 'book'
    `;
    expect(rows).toEqual([
      { type: "BALANCE", assetClass: "CASH_AND_CASH_EQUIVALENTS" },
    ]);
    await expect(db.$executeRaw`
      UPDATE "Account" SET "assetClass" = 'EQUITIES'
      WHERE "id" = 'expense' AND "accountBookId" = 'book'
    `).rejects.toThrow();
    expect(
      await db.$executeRaw`
      UPDATE "Account" SET "assetClass" = 'FIXED_INCOME'
      WHERE "id" = 'liability' AND "accountBookId" = 'book'
    `,
    ).toBe(1);
  });

  it("keeps cache triggers active and their revisions transactional", async () => {
    async function revision() {
      return (await db.accountBook.findUniqueOrThrow({ where: { id: "book" } }))
        .periodCacheRevision;
    }
    let previous = await revision();
    for (const table of ["Account", "AccountGroup", "Transaction", "Booking"]) {
      const field =
        table === "Transaction" || table === "Booking" ? "description" : "name";
      await db.$executeRawUnsafe(
        `UPDATE "${table}" SET "${field}" = "${field}" WHERE "accountBookId" = 'book'`,
      );
      const current = await revision();
      expect(current).not.toBe(previous);
      previous = current;
    }
    await expect(
      db.$transaction(async (tx) => {
        await tx.account.update({
          select: { id: true },
          where: { id_accountBookId: { id: "asset", accountBookId: "book" } },
          data: { name: "Rollback" },
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await revision()).toBe(previous);
  });
});
