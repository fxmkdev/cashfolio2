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
const stagingDatabase = `preview_test_staging_${suffix}`;
const stagingRole = `preview_test_staging_app_${suffix}`;
const stagingSeedRole = `preview_test_staging_seed_${suffix}`;
const stagingPassword = randomUUID().replaceAll("-", "");
const stagingSeedPassword = randomUUID().replaceAll("-", "");
const stagingRolesCreated: string[] = [];
let stagingCreated = false;
let staging: Client;
let originalStaging: Awaited<ReturnType<typeof stagingSnapshot>>;
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
async function stagingSnapshot() {
  return {
    database: (
      await root.query(
        "SELECT pg_get_userbyid(datdba) AS owner, datacl::text AS permissions FROM pg_database WHERE datname = $1",
        [stagingDatabase],
      )
    ).rows,
    roles: (
      await root.query(
        "SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolinherit FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname",
        [[stagingRole, stagingSeedRole]],
      )
    ).rows,
    data: (await staging.query("SELECT * FROM staging_fixture ORDER BY id"))
      .rows,
    tablePermissions: (
      await staging.query(
        "SELECT relacl::text AS permissions FROM pg_class WHERE oid = 'staging_fixture'::regclass",
      )
    ).rows,
  };
}

async function verifyStagingUnchanged() {
  expect(await stagingSnapshot()).toEqual(originalStaging);
  // New connections prove grants and passwords survived; an existing session
  // alone would not detect revoked CONNECT permissions.
  for (const [role, password] of [
    [stagingRole, stagingPassword],
    [stagingSeedRole, stagingSeedPassword],
  ]) {
    const client = await connect(stagingDatabase, role, password);
    expect(
      (await client.query("SELECT * FROM staging_fixture ORDER BY id")).rows,
    ).toEqual(originalStaging.data);
    await client.end();
  }
}

beforeAll(async () => {
  await root.connect();
  // Existing staging data and credentials predate preview bootstrap on this host.
  for (const [role, password] of [
    [stagingRole, stagingPassword],
    [stagingSeedRole, stagingSeedPassword],
  ]) {
    await root.query(
      `CREATE ROLE ${identifier(role)} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    stagingRolesCreated.push(role);
  }
  await root.query(
    `CREATE DATABASE ${identifier(stagingDatabase)} OWNER ${identifier(stagingRole)}`,
  );
  stagingCreated = true;
  staging = await connect(stagingDatabase, stagingRole, stagingPassword);
  await staging.query(
    "CREATE TABLE staging_fixture (id integer PRIMARY KEY, value text NOT NULL)",
  );
  await staging.query(
    "INSERT INTO staging_fixture VALUES (1, 'retained staging data')",
  );
  await staging.query(
    `GRANT SELECT ON staging_fixture TO ${identifier(stagingSeedRole)}`,
  );
  // Root creates the operator fixture. Preview bootstrap itself has no superuser.

  await root.query(
    `CREATE ROLE ${identifier(operatorRole)} LOGIN PASSWORD '${operatorPassword}' CREATEDB CREATEROLE NOSUPERUSER NOREPLICATION NOBYPASSRLS`,
  );
  createdOperator = true;
  await root.query(
    `GRANT ${identifier(stagingRole)} TO ${identifier(operatorRole)} WITH INHERIT TRUE, SET TRUE`,
  );
  const operator = await connect("postgres", operatorRole, operatorPassword);
  // Match documented shared-host setup: retain each existing consumer explicitly
  // before revoking the default PUBLIC connection privilege.
  await operator.query(
    `GRANT CONNECT ON DATABASE ${identifier(stagingDatabase)} TO ${identifier(stagingRole)}, ${identifier(stagingSeedRole)}`,
  );
  await operator.query(
    `REVOKE CONNECT ON DATABASE ${identifier(stagingDatabase)} FROM PUBLIC`,
  );
  originalStaging = await stagingSnapshot();
  await verifyStagingUnchanged();
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
  if (stagingCreated)
    await attempt(() =>
      root.query(
        `DROP DATABASE IF EXISTS ${identifier(stagingDatabase)} WITH (FORCE)`,
      ),
    );
  for (const role of stagingRolesCreated.toReversed())
    await attempt(() => root.query(`DROP ROLE IF EXISTS ${identifier(role)}`));
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
it("preserves existing staging data, ownership, grants and credentials through bootstrap", async () => {
  await verifyStagingUnchanged();
});
it("provisions from empty, reuses after a title change and keeps role credentials stable", async () => {
  const again = await provisionDatabase(admin, {
    ...input,
    title: "Changed title",
  });
  expect(again).toEqual(first);
  await verifyStagingUnchanged();
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
it("permits its migrations but rejects staging, control, other previews and staging role assumption", async () => {
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
  ]) {
    for (const database of [second.database, stagingDatabase, controlDatabase])
      await expect(connect(database, role, password)).rejects.toThrow(
        /permission denied/,
      );
    const preview = await connect(first.database, role, password);
    for (const stagingIdentity of [stagingRole, stagingSeedRole])
      await expect(
        preview.query(`SET ROLE ${identifier(stagingIdentity)}`),
      ).rejects.toThrow(/permission denied/);
  }
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
it("cleanup is idempotent and preserves staging and another preview", async () => {
  await cleanupDatabase(admin, numbers[1]);
  await cleanupDatabase(admin, numbers[1]);
  await verifyStagingUnchanged();
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
