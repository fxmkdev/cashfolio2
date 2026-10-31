import { randomInt, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { provisionDatabase, cleanupDatabase, identifier } from "./database.ts";

// Only disposable databases on a local PostgreSQL service are permitted here.
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
    "Preview provisioning tests require a local postgres maintenance database.",
  );
const root = new Client({ connectionString: maintenance.href });
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const operatorRole = `preview_test_operator_${suffix}`;
const operatorPassword = randomUUID().replaceAll("-", "");
const adminRole = `preview_test_provisioner_${suffix}`;
const adminPassword = randomUUID().replaceAll("-", "");
const controlDatabase = `preview_test_control_${suffix}`;
const numbers = [
  randomInt(100_000_000, 500_000_000),
  randomInt(500_000_001, 900_000_000),
];
const input = {
  number: numbers[0],
  headRef: "feature/test",
  title: `Integration ${suffix}`,
  passwordKey: "ab".repeat(32),
  adminRole,
};
let admin: Client;
let first: Awaited<ReturnType<typeof provisionDatabase>>;
let second: typeof first;
let createdRole = false;
let createdOperator = false;
const connected: Client[] = [];
async function connect(database: string, user: string, password: string) {
  const url = new URL(maintenance);
  url.pathname = `/${database}`;
  url.username = user;
  url.password = password;
  const client = new Client({ connectionString: url.href });
  connected.push(client);
  await client.connect();
  return client;
}
beforeAll(async () => {
  await root.connect();
  // Root creates only the operator fixture. Bootstrap must work without superuser access.
  await root.query(
    `CREATE ROLE ${identifier(operatorRole)} LOGIN PASSWORD '${operatorPassword}' CREATEDB CREATEROLE NOSUPERUSER NOREPLICATION NOBYPASSRLS`,
  );
  createdOperator = true;
  const operator = await connect("postgres", operatorRole, operatorPassword);
  await operator.query("SET createrole_self_grant = ''");
  await operator.query(
    `CREATE ROLE ${identifier(adminRole)} LOGIN PASSWORD '${adminPassword}' CREATEDB CREATEROLE NOINHERIT NOSUPERUSER NOREPLICATION NOBYPASSRLS`,
  );
  createdRole = true;
  const createControlDatabase = `CREATE DATABASE ${identifier(controlDatabase)} OWNER ${identifier(adminRole)}`;
  await expect(operator.query(createControlDatabase)).rejects.toMatchObject({
    code: "42501",
    message: expect.stringContaining("must be able to SET ROLE"),
  });
  await operator.query(
    `GRANT ${identifier(adminRole)} TO CURRENT_USER WITH SET TRUE`,
  );
  await operator.query(createControlDatabase);
  await operator.query(
    `REVOKE ALL ON DATABASE ${identifier(controlDatabase)} FROM PUBLIC`,
  );
  admin = await connect(controlDatabase, adminRole, adminPassword);
  first = await provisionDatabase(admin, input);
  second = await provisionDatabase(admin, { ...input, number: numbers[1] });
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
  for (const client of connected.reverse()) await attempt(() => client.end());
  // Root is local test-only and can clean up after an injected failure.
  if (createdRole) {
    for (const number of numbers)
      await attempt(() => cleanupDatabase(root, number));
    await attempt(() =>
      root.query(
        `DROP DATABASE IF EXISTS ${identifier(controlDatabase)} WITH (FORCE)`,
      ),
    );
    await attempt(() => root.query(`DROP ROLE ${identifier(adminRole)}`));
  }
  if (createdOperator)
    await attempt(() => root.query(`DROP ROLE ${identifier(operatorRole)}`));
  await attempt(() => root.end());
  if (errors.length)
    throw new AggregateError(errors, "Preview fixture cleanup failed.");
});
it("bootstraps the control database under a nonsuperuser operator with an explicit SET grant", async () => {
  expect(
    (
      await admin.query(
        "SELECT current_database() AS database, current_user AS role",
      )
    ).rows,
  ).toEqual([{ database: controlDatabase, role: adminRole }]);
  expect(
    (
      await root.query(
        "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1",
        [controlDatabase],
      )
    ).rows,
  ).toEqual([{ owner: adminRole }]);
  expect(
    (
      await root.query(
        "SELECT rolsuper FROM pg_roles WHERE rolname = ANY($1)",
        [[operatorRole, adminRole]],
      )
    ).rows,
  ).toEqual([{ rolsuper: false }, { rolsuper: false }]);
});
it("provisions from empty, reuses after a title change and keeps role credentials stable", async () => {
  const again = await provisionDatabase(admin, {
    ...input,
    title: "Changed title",
  });
  expect(again).toEqual(first);
  const app = await connect(first.database, first.appRole, first.appPassword);
  const { rows } = await app.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
  );
  expect(rows).toEqual([]);
  const { rows: roles } = await root.query(
    "SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = ANY($1)",
    [[first.appRole, first.seedRole]],
  );
  expect(roles).toHaveLength(2);
  for (const role of roles)
    expect(Object.values(role)).toEqual([false, false, false, false]);
});
it("permits migrations in its database and rejects access to another preview", async () => {
  const url = new URL(maintenance);
  url.pathname = `/${first.database}`;
  url.username = first.appRole;
  url.password = first.appPassword;
  await promisify(execFile)("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url.href },
    maxBuffer: 4 * 1024 * 1024,
  });
  const app = await connect(first.database, first.appRole, first.appPassword);
  expect(
    (await app.query('SELECT count(*)::int AS count FROM "User"')).rows[0]
      .count,
  ).toBe(0);
  for (const [role, password] of [
    [first.appRole, first.appPassword],
    [first.seedRole, first.seedPassword],
  ])
    await expect(connect(second.database, role, password)).rejects.toThrow(
      /permission denied/,
    );
  await expect(
    app.query('CREATE DATABASE "unauthorized_preview_test"'),
  ).rejects.toThrow(/permission denied/);
  await expect(
    app.query("CREATE ROLE unauthorized_preview_test"),
  ).rejects.toThrow(/permission denied/);
  const seed = await connect(
    first.database,
    first.seedRole,
    first.seedPassword,
  );
  await expect(seed.query('SELECT * FROM "User"')).rejects.toThrow(
    /permission denied/,
  );
});
it("cleanup is idempotent and cannot remove another preview", async () => {
  await cleanupDatabase(admin, numbers[1]);
  await cleanupDatabase(admin, numbers[1]);
  expect(
    (
      await root.query("SELECT 1 FROM pg_database WHERE datname=$1", [
        first.database,
      ])
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await root.query("SELECT 1 FROM pg_database WHERE datname=$1", [
        second.database,
      ])
    ).rows,
  ).toHaveLength(0);
});
