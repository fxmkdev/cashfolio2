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
// Historical enum values and flat defaults must not follow today's taxonomy.
const legacyAssetClassNodes = Object.entries({
  CASH_AND_CASH_EQUIVALENTS: "Cash & Cash Equivalents",
  EQUITIES: "Equities",
  FIXED_INCOME: "Fixed Income",
  REAL_ESTATE: "Real Estate",
  COMMODITIES_AND_PRECIOUS_METALS: "Commodities & Precious Metals",
  DIGITAL_ASSETS: "Digital Assets",
  ALTERNATIVE_INVESTMENTS: "Alternative Investments",
  OTHER_ASSETS: "Other Assets",
}).map(([id, name], sortOrder) => ({ id, name, parentId: null, sortOrder }));
const hierarchyMigration = "20261101120000_hierarchical_default_asset_classes";
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
async function existingClassifications() {
  return {
    schemes: await db.classificationScheme.findMany({
      orderBy: [{ accountBookId: "asc" }, { id: "asc" }],
    }),
    nodes: await db.classificationNode.findMany({
      orderBy: [{ accountBookId: "asc" }, { id: "asc" }],
    }),
    assignments: await db.accountClassification.findMany({
      orderBy: [{ accountBookId: "asc" }, { accountId: "asc" }],
    }),
    books: await db.accountBook.findMany({
      orderBy: { id: "asc" },
      select: { id: true, periodCacheRevision: true },
    }),
  };
}
let beforeHierarchy: Awaited<ReturnType<typeof existingClassifications>>;
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
  for (const node of legacyAssetClassNodes)
    for (const isActive of [true, false]) {
      const id = `${node.id}-${isActive}`;
      await db.$executeRaw`INSERT INTO "Account" ("id","accountBookId","name","type","unit","currency","assetClass","isActive","updatedAt") VALUES (${id},'book',${id},'BALANCE','CURRENCY','CHF',${node.id}::"AssetClass",${isActive},NOW())`;
    }
  await db.$executeRaw`INSERT INTO "Account" ("id","accountBookId","name","type","unit","currency","updatedAt") VALUES ('unclassified','book','Unclassified','BALANCE','CURRENCY','CHF',NOW())`;
  // Apply the original classifications migration before testing the new defaults.
  await cp("prisma", directory, {
    recursive: true,
    filter: (source) =>
      !source
        .split(/[\\/]/)
        .some((part) => /^\d{14}_/.test(part) && part >= hierarchyMigration),
  });
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
      id: "customized",
      name: "Customized Existing Book",
      referenceCurrency: "CHF",
      startDate: new Date("2026-01-01"),
    },
  });
  await db.classificationScheme.update({
    where: {
      id_accountBookId: { id: "assetClass", accountBookId: "customized" },
    },
    data: { name: "My Asset Classes" },
  });
  await db.classificationNode.update({
    where: {
      id_schemeId_accountBookId: {
        id: "EQUITIES",
        schemeId: "assetClass",
        accountBookId: "customized",
      },
    },
    data: { name: "My Shares", sortOrder: 10 },
  });
  await db.classificationNode.update({
    where: {
      id_schemeId_accountBookId: {
        id: "OTHER_ASSETS",
        schemeId: "assetClass",
        accountBookId: "customized",
      },
    },
    data: {
      name: "Collectibles",
      parentId: "ALTERNATIVE_INVESTMENTS",
      sortOrder: 4,
    },
  });
  // Even a custom node colliding with a new default ID must remain untouched.
  await db.classificationNode.create({
    data: {
      id: "BANK_DEPOSITS",
      schemeId: "assetClass",
      accountBookId: "customized",
      name: "My Custom Holding",
      parentId: "EQUITIES",
      sortOrder: 3,
    },
  });
  await db.classificationNode.delete({
    where: {
      id_schemeId_accountBookId: {
        id: "REAL_ESTATE",
        schemeId: "assetClass",
        accountBookId: "customized",
      },
    },
  });
  for (const isActive of [true, false]) {
    const id = `customized-${isActive}`;
    await db.account.create({
      data: {
        id,
        accountBookId: "customized",
        name: id,
        type: "BALANCE",
        unit: "CURRENCY",
        currency: "CHF",
        isActive,
      },
    });
    await db.accountClassification.create({
      data: {
        accountId: id,
        accountBookId: "customized",
        schemeId: "assetClass",
        nodeId: isActive ? "BANK_DEPOSITS" : "OTHER_ASSETS",
      },
    });
  }
  beforeHierarchy = await existingClassifications();
  await run("pnpm", ["exec", "prisma", "migrate", "deploy"], options);
});
afterAll(async () => {
  await db.$disconnect();
  if (created)
    await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.$disconnect();
  if (directory) await rm(directory, { recursive: true, force: true });
});
it("preserves existing schemes, customized trees, assignments and cache revisions", async () => {
  expect(await existingClassifications()).toEqual(beforeHierarchy);
});
it("backfills stable class IDs and preserves active and archived assignments", async () => {
  expect(
    await db.classificationScheme.findMany({
      where: { accountBookId: "book" },
    }),
  ).toEqual([{ id: "assetClass", accountBookId: "book", name: "Asset Class" }]);
  expect(
    await db.classificationNode.findMany({
      where: { accountBookId: "book" },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, parentId: true, sortOrder: true },
    }),
  ).toEqual(legacyAssetClassNodes);
  const assignments = await db.accountClassification.findMany({
    where: { accountBookId: "book" },
  });
  expect(assignments).toHaveLength(16);
  for (const node of legacyAssetClassNodes)
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
    await db.classificationNode.findMany({
      where: { accountBookId: "second" },
      orderBy: { id: "asc" },
      select: { id: true, name: true, parentId: true, sortOrder: true },
    }),
  ).toEqual(
    defaultAssetClassNodes.toSorted((a, b) => a.id.localeCompare(b.id)),
  );
  await db.account.create({
    data: {
      id: "parent-assigned",
      accountBookId: "second",
      name: "Broad Equities",
      type: "BALANCE",
      unit: "CURRENCY",
      currency: "CHF",
    },
  });
  await expect(
    db.accountClassification.create({
      data: {
        accountId: "parent-assigned",
        accountBookId: "second",
        schemeId: "assetClass",
        nodeId: "EQUITIES",
      },
    }),
  ).resolves.toMatchObject({ nodeId: "EQUITIES" });
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
