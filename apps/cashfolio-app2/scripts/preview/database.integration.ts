import { randomInt, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { PrismaClient } from "../../src/.prisma-client/client";
import { generateStagingDataset } from "../../src/staging-seed/dataset";
import { replaceStagingData } from "../../src/staging-seed/writer";
import { provisionDatabase, cleanupDatabase, identifier } from "./database.ts";

// These fixtures create and drop only disposable databases on local PostgreSQL.
const maintenance = new URL(
  process.env.STAGING_SEED_TEST_ADMIN_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5433/postgres",
);
if (
  !["127.0.0.1", "localhost", "postgres"].includes(maintenance.hostname) ||
  maintenance.pathname !== "/postgres" ||
  maintenance.search
)
  throw new Error(
    "Preview tests require a local postgres maintenance database.",
  );
const root = new Client({ connectionString: maintenance.href });
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const sharedRole = `preview_test_owner_${suffix}`;
const password = randomUUID().replaceAll("-", "");
const stagingDatabase = `preview_test_staging_${suffix}`;
const host = { database: stagingDatabase, role: sharedRole };
const numbers = [
  randomInt(100_000_000, 500_000_000),
  randomInt(500_000_001, 900_000_000),
];
const input = {
  number: numbers[0],
  headRef: "feature/test",
  title: `Integration ${suffix}`,
  host,
};
const connections: Client[] = [];
let roleCreated = false;
let stagingCreated = false;
let staging: Client;
let first: Awaited<ReturnType<typeof provisionDatabase>>;
let second: typeof first;
let originalStaging: Awaited<ReturnType<typeof stagingSnapshot>>;

function databaseUrl(database: string) {
  const url = new URL(maintenance);
  url.pathname = `/${database}`;
  url.username = sharedRole;
  url.password = password;
  return url.href;
}
async function connect(database: string) {
  const client = new Client({ connectionString: databaseUrl(database) });
  connections.push(client);
  await client.connect();
  return client;
}
async function stagingSnapshot() {
  return {
    database: (
      await root.query(
        "SELECT pg_get_userbyid(datdba) AS owner, datacl::text AS permissions FROM pg_database WHERE datname=$1",
        [stagingDatabase],
      )
    ).rows,
    role: (
      await root.query(
        "SELECT rolcreatedb, rolcreaterole, rolsuper FROM pg_roles WHERE rolname=$1",
        [sharedRole],
      )
    ).rows,
    table: (await staging.query("SELECT * FROM staging_fixture ORDER BY id"))
      .rows,
    permissions: (
      await staging.query(
        "SELECT relacl::text FROM pg_class WHERE oid='staging_fixture'::regclass",
      )
    ).rows,
  };
}
async function verifyStagingUnchanged() {
  expect(await stagingSnapshot()).toEqual(originalStaging);
  const fresh = await connect(stagingDatabase);
  expect(
    (await fresh.query("SELECT * FROM staging_fixture ORDER BY id")).rows,
  ).toEqual(originalStaging.table);
  await fresh.end();
}

beforeAll(async () => {
  await root.connect();
  // Model an existing staging owner: database creation, no role administration.
  await root.query(
    `CREATE ROLE ${identifier(sharedRole)} LOGIN PASSWORD '${password}' CREATEDB NOCREATEROLE NOSUPERUSER`,
  );
  roleCreated = true;
  await root.query(
    `CREATE DATABASE ${identifier(stagingDatabase)} OWNER ${identifier(sharedRole)}`,
  );
  stagingCreated = true;
  staging = await connect(stagingDatabase);
  await staging.query(
    "CREATE TABLE staging_fixture (id integer PRIMARY KEY, value text NOT NULL)",
  );
  await staging.query(
    "INSERT INTO staging_fixture VALUES (1, 'retained staging data')",
  );
  originalStaging = await stagingSnapshot();
  first = await provisionDatabase(staging, input);
  second = await provisionDatabase(staging, { ...input, number: numbers[1] });
});

afterAll(async () => {
  const errors: unknown[] = [];
  const attempt = async (cleanup: () => Promise<unknown>) => {
    try {
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
  };
  for (const client of connections.toReversed())
    await attempt(() => client.end());
  // Local root can recover fixtures even if setup or an assertion failed midway.
  if (roleCreated) {
    for (const number of numbers)
      await attempt(() => cleanupDatabase(root, number, host));
  }
  if (stagingCreated)
    await attempt(() =>
      root.query(`DROP DATABASE ${identifier(stagingDatabase)} WITH (FORCE)`),
    );
  if (roleCreated)
    await attempt(() => root.query(`DROP ROLE ${identifier(sharedRole)}`));
  await attempt(() => root.end());
  if (errors.length)
    throw new AggregateError(errors, "Preview fixture cleanup failed.");
});

it("creates empty databases with the existing owner, preserves staging grants and reuses title changes", async () => {
  const again = await provisionDatabase(staging, {
    ...input,
    title: "Changed title",
  });
  expect(again).toEqual(first);
  const preview = await connect(first.database);
  expect(
    (
      await preview.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
      )
    ).rows,
  ).toEqual([]);
  expect(
    (
      await root.query(
        "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=ANY($1)",
        [[first.database, second.database]],
      )
    ).rows,
  ).toEqual([{ owner: sharedRole }, { owner: sharedRole }]);
  expect(originalStaging.role).toEqual([
    { rolcreatedb: true, rolcreaterole: false, rolsuper: false },
  ]);
  await verifyStagingUnchanged();
});

it("uses the shared application login for migrations and transactional seeding", async () => {
  const url = databaseUrl(first.database);
  await promisify(execFile)("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    maxBuffer: 4 * 1024 * 1024,
  });
  const target = {
    hostname: maintenance.hostname,
    projectId: "preview-test",
    branchId: "br-test",
    endpointId: "ep-test",
    database: first.database,
    role: sharedRole,
  };
  // Local PostgreSQL substitutes the immutable identities that Neon supplies.
  for (const [key, value] of [
    ["neon.project_id", target.projectId],
    ["neon.branch_id", target.branchId],
    ["neon.endpoint_id", target.endpointId],
  ])
    await root.query(
      `ALTER DATABASE ${identifier(first.database)} SET "${key}" TO '${value}'`,
    );
  const app = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    const summary = await replaceStagingData(
      app,
      {
        target,
        testerExternalIds: ["preview-test-admin"],
        adminExternalIds: ["preview-test-admin"],
      },
      generateStagingDataset(),
    );
    expect(summary.books).toHaveLength(3);
    expect(await app.accountBook.count()).toBe(3);
    expect(await app.classificationNode.count()).toBeGreaterThan(0);
  } finally {
    await app.$disconnect();
  }
  await verifyStagingUnchanged();
});

it("allows the same login to access other trusted nonproduction databases", async () => {
  const other = await connect(second.database);
  try {
    expect((await other.query("SELECT current_user AS role")).rows).toEqual([
      { role: sharedRole },
    ]);
  } finally {
    await other.end();
  }
  await verifyStagingUnchanged();
});

it("guards staging, cleans up idempotently and leaves the other preview intact", async () => {
  await expect(
    cleanupDatabase(staging, numbers[0], { ...host, database: first.database }),
  ).rejects.toThrow("Unexpected preview");
  await cleanupDatabase(staging, numbers[1], host);
  await cleanupDatabase(staging, numbers[1], host);
  expect(
    (
      await root.query(
        "SELECT datname FROM pg_database WHERE datname=ANY($1)",
        [[first.database, second.database]],
      )
    ).rows,
  ).toEqual([{ datname: first.database }]);
  await verifyStagingUnchanged();
});
