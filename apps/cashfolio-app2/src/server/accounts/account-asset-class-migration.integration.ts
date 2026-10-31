import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PrismaClient } from "../../.prisma-client/client";
import { AccountType, AssetClass, Unit } from "../../.prisma-client/enums";

const run = promisify(execFile);
const migrationName = "20261024120000_add_account_asset_class";
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
const databaseName = `asset_class_test_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl.href }),
});
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl.href }),
});
let databaseCreated = false;
let previousSchemaDirectory: string | undefined;

beforeAll(async () => {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  previousSchemaDirectory = await mkdtemp(
    join(tmpdir(), "asset-class-migration-"),
  );
  await cp("prisma", previousSchemaDirectory, {
    recursive: true,
    filter: (source) =>
      !source
        .split(/[\\/]/)
        .some((part) => /^\d{14}_/.test(part) && part >= migrationName),
  });
  const options = {
    env: { ...process.env, DATABASE_URL: databaseUrl.href },
    maxBuffer: 4 * 1024 * 1024,
  };
  await run(
    "pnpm",
    [
      "exec",
      "prisma",
      "migrate",
      "deploy",
      "--schema",
      join(previousSchemaDirectory, "schema.prisma"),
    ],
    options,
  );
  await db.accountBook.create({
    data: {
      id: "book",
      name: "Migration fixture",
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01"),
    },
  });
  // These tokens describe the schema before the asset-class and balance cutovers.
  for (const type of ["ASSET", "LIABILITY", "EQUITY"] as const) {
    for (const unit of Object.values(Unit)) {
      for (const isActive of [true, false]) {
        const id = `${type}-${unit}-${isActive}`;
        await db.$executeRaw`
          INSERT INTO "Account" ("id", "accountBookId", "name", "type", "unit", "isActive", "isCashAccount", "updatedAt")
          VALUES (${id}, 'book', ${id}, ${type}::"AccountType", ${unit}::"Unit", ${isActive}, ${type === "ASSET" && unit === Unit.CURRENCY}, NOW())
        `;
      }
    }
  }
  await run("pnpm", ["exec", "prisma", "migrate", "deploy"], options);
});

afterAll(async () => {
  await db.$disconnect();
  if (databaseCreated)
    await admin.$executeRawUnsafe(
      `DROP DATABASE "${databaseName}" WITH (FORCE)`,
    );
  await admin.$disconnect();
  if (previousSchemaDirectory)
    await rm(previousSchemaDirectory, { recursive: true, force: true });
});

it("leaves all existing accounts Unclassified without inferring from metadata", async () => {
  const accounts = await db.account.findMany();
  expect(accounts).toHaveLength(19);
  expect(accounts.every((account) => account.assetClass === null)).toBe(true);
});

it("defaults newly created accounts to Unclassified", async () => {
  const account = await db.account.create({
    data: {
      id: "new",
      accountBookId: "book",
      name: "New cryptocurrency",
      type: AccountType.BALANCE,
      unit: Unit.CRYPTOCURRENCY,
      cryptocurrency: "BTC",
    },
  });
  expect(account.assetClass).toBeNull();
});

it("allows all classes on converted balance accounts and rejects classified equity", async () => {
  for (const legacyType of ["ASSET", "LIABILITY"]) {
    for (const assetClass of Object.values(AssetClass)) {
      const updated = await db.account.update({
        where: {
          id_accountBookId: {
            id: `${legacyType}-CURRENCY-true`,
            accountBookId: "book",
          },
        },
        data: { assetClass },
      });
      expect(updated.assetClass).toBe(assetClass);
    }
  }
  await expect(
    db.account.update({
      where: {
        id_accountBookId: { id: "EQUITY-CURRENCY-true", accountBookId: "book" },
      },
      data: { assetClass: AssetClass.EQUITIES },
    }),
  ).rejects.toThrow();
});

it("defaults existing and new accounts to individual units without inference", async () => {
  const accounts = await db.account.findMany();
  expect(
    accounts.every((account) => account.trackingMethod === "INDIVIDUAL_UNITS"),
  ).toBe(true);
});

it("allows portfolio tracking only on currency balance accounts, including archived accounts", async () => {
  for (const isActive of [true, false]) {
    const updated = await db.account.update({
      where: {
        id_accountBookId: {
          id: `ASSET-CURRENCY-${isActive}`,
          accountBookId: "book",
        },
      },
      data: { trackingMethod: "TOTAL_PORTFOLIO_VALUE" },
    });
    expect(updated.trackingMethod).toBe("TOTAL_PORTFOLIO_VALUE");
  }
  for (const id of [
    "ASSET-SECURITY-true",
    "ASSET-CRYPTOCURRENCY-true",
    "EQUITY-CURRENCY-true",
  ]) {
    await expect(
      db.account.update({
        where: { id_accountBookId: { id, accountBookId: "book" } },
        data: { trackingMethod: "TOTAL_PORTFOLIO_VALUE" },
      }),
    ).rejects.toThrow();
  }
});
