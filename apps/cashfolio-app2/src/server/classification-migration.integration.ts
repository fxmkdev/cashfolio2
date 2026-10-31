import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PrismaClient } from "../.prisma-client/client";
import { defaultAssetClassNodes } from "../shared/asset-class";
const run = promisify(execFile);
const adminUrl = new URL(
  process.env.MUTATION_TEST_ADMIN_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5433/postgres",
);
if (
  !["postgresql:", "postgres:"].includes(adminUrl.protocol) ||
  !["127.0.0.1", "localhost", "postgres"].includes(adminUrl.hostname) ||
  adminUrl.pathname !== "/postgres" ||
  [...adminUrl.searchParams.keys()].some((k) => k !== "schema")
)
  throw new Error(
    "Migration tests require a local postgres maintenance database.",
  );
const name = `classification_test_${randomUUID().replaceAll("-", "")}`;
const url = new URL(adminUrl);
url.pathname = `/${name}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl.href }),
});
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.href }),
});
let created = false,
  directory: string | undefined;
beforeAll(async () => {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  created = true;
  directory = await mkdtemp(join(tmpdir(), "classification-migration-"));
  await cp("prisma", directory, {
    recursive: true,
    filter: (source) =>
      !source
        .split(/[\\/]/)
        .some(
          (part) =>
            /^\d{14}_/.test(part) &&
            part >= "20261031120000_editable_classifications",
        ),
  });
  const options = {
    env: { ...process.env, DATABASE_URL: url.href },
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
      join(directory, "schema.prisma"),
    ],
    options,
  );
  await db.accountBook.create({
    data: {
      id: "book",
      name: "Old Book",
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01"),
    },
  });
  for (const node of defaultAssetClassNodes)
    for (const isActive of [true, false]) {
      const id = `${node.id}-${isActive}`;
      await db.$executeRaw`INSERT INTO "Account" ("id","accountBookId","name","type","unit","currency","assetClass","isActive","updatedAt") VALUES (${id},'book',${id},'BALANCE','CURRENCY','CHF',${node.id}::"AssetClass",${isActive},NOW())`;
    }
  await db.$executeRaw`INSERT INTO "Account" ("id","accountBookId","name","type","unit","currency","updatedAt") VALUES ('unclassified','book','Unclassified','BALANCE','CURRENCY','CHF',NOW())`;
  await run("pnpm", ["exec", "prisma", "migrate", "deploy"], options);
});
afterAll(async () => {
  await db.$disconnect();
  if (created)
    await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.$disconnect();
  if (directory) await rm(directory, { recursive: true, force: true });
});
it("backfills stable class IDs and preserves active and archived assignments", async () => {
  expect(await db.classificationScheme.findMany()).toEqual([
    { id: "assetClass", accountBookId: "book", name: "Asset Class" },
  ]);
  expect(
    await db.classificationNode.findMany({
      where: { accountBookId: "book" },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, parentId: true, sortOrder: true },
    }),
  ).toEqual(defaultAssetClassNodes);
  const assignments = await db.accountClassification.findMany({
    where: { accountBookId: "book" },
  });
  expect(assignments).toHaveLength(16);
  for (const node of defaultAssetClassNodes)
    for (const isActive of [true, false])
      expect(assignments).toContainEqual({
        accountId: `${node.id}-${isActive}`,
        accountBookId: "book",
        schemeId: "assetClass",
        nodeId: node.id,
      });
  expect(assignments.some((a) => a.accountId === "unclassified")).toBe(false);
  const columns = await db.$queryRaw<
    Array<{ column_name: string }>
  >`SELECT column_name FROM information_schema.columns WHERE table_name='Account' AND column_name='assetClass'`;
  expect(columns).toEqual([]);
});
it("initializes every new book, enforces uniqueness, book isolation and balance eligibility", async () => {
  await db.accountBook.create({
    data: {
      id: "second",
      name: "New Book",
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01"),
    },
  });
  expect(
    await db.classificationNode.count({ where: { accountBookId: "second" } }),
  ).toBe(8);
  await expect(
    db.accountClassification.create({
      data: {
        accountBookId: "second",
        accountId: "unclassified",
        schemeId: "assetClass",
        nodeId: "EQUITIES",
      },
    }),
  ).rejects.toThrow();
  await expect(
    db.accountClassification.create({
      data: {
        accountBookId: "book",
        accountId: "EQUITIES-true",
        schemeId: "assetClass",
        nodeId: "FIXED_INCOME",
      },
    }),
  ).rejects.toThrow();
  const equity = await db.account.findFirstOrThrow({
    where: { accountBookId: "book", type: "EQUITY" },
  });
  await expect(
    db.accountClassification.create({
      data: {
        accountBookId: "book",
        accountId: equity.id,
        schemeId: "assetClass",
        nodeId: "EQUITIES",
      },
    }),
  ).rejects.toThrow();
});
it("tracks revision changes for classification edits and supports cascading book deletion with nested assigned classes", async () => {
  const revision = async () =>
    (await db.accountBook.findUniqueOrThrow({ where: { id: "second" } }))
      .periodCacheRevision;
  const before = await revision();
  await db.classificationNode.create({
    data: {
      id: "child",
      accountBookId: "second",
      schemeId: "assetClass",
      name: "Child",
      parentId: "EQUITIES",
      sortOrder: 0,
    },
  });
  expect(await revision()).not.toBe(before);
  await db.account.create({
    data: {
      id: "assigned",
      accountBookId: "second",
      name: "Assigned",
      type: "BALANCE",
      unit: "CURRENCY",
      currency: "CHF",
    },
  });
  await db.accountClassification.create({
    data: {
      accountBookId: "second",
      accountId: "assigned",
      schemeId: "assetClass",
      nodeId: "child",
    },
  });
  const assignedRevision = await revision();
  await db.classificationNode.update({
    where: {
      id_schemeId_accountBookId: {
        id: "child",
        accountBookId: "second",
        schemeId: "assetClass",
      },
    },
    data: {
      name: "Renamed",
      parentId: "CASH_AND_CASH_EQUIVALENTS",
      sortOrder: 2,
    },
  });
  expect(await revision()).not.toBe(assignedRevision);
  await db.accountBook.delete({ where: { id: "second" } });
  expect(
    await db.classificationNode.count({ where: { accountBookId: "second" } }),
  ).toBe(0);
  expect(
    await db.accountClassification.count({
      where: { accountBookId: "second" },
    }),
  ).toBe(0);
});
