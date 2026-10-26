import { createHmac } from "node:crypto";
import type { QueryResultRow } from "pg";
import { previewNames, prNumber } from "./names.ts";

export interface SqlClient {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export function identifier(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,63}$/.test(value))
    throw new Error("Invalid database identifier.");
  return `"${value}"`;
}
export function previewPassword(
  key: string,
  number: number,
  kind: "app" | "seed",
): string {
  prNumber(number);
  if (!/^(?:[a-f0-9]{2}){32,}$/.test(key))
    throw new Error(
      "A provisioning-only hex key of at least 32 bytes is required.",
    );
  return createHmac("sha256", Buffer.from(key, "hex"))
    .update(`cashfolio-preview-v1:${number}:${kind}`)
    .digest("hex");
}

async function ownedDatabase(client: SqlClient, number: number) {
  prNumber(number);
  const appRole = `cashfolio_pr_${number}_app`;
  const { rows } = await client.query<{ name: string }>(
    "SELECT datname AS name FROM pg_database d JOIN pg_roles r ON r.oid = d.datdba WHERE r.rolname = $1",
    [appRole],
  );
  if (
    rows.length > 1 ||
    rows.some(
      ({ name }) =>
        !new RegExp(`^pr-${number}-[a-z0-9-]+-cashfolio-app2$`).test(name),
    )
  )
    throw new Error(
      "Unexpected database ownership; operator review is required.",
    );
  return rows[0]?.name;
}

async function ensureRole(
  client: SqlClient,
  number: number,
  kind: "app" | "seed",
  password: string,
  adminRole: string,
) {
  const role = `cashfolio_pr_${number}_${kind}`;
  const marker = `cashfolio-preview:${number}:${kind}`;
  const { rows } = await client.query<{ safe: boolean; marker: string | null }>(
    `
    SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit)
      AND rolcanlogin AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid) AS safe,
      shobj_description(oid, 'pg_authid') AS marker FROM pg_roles r WHERE rolname = $1`,
    [role],
  );
  if (rows.length) {
    if (rows.length !== 1 || !rows[0].safe || rows[0].marker !== marker)
      throw new Error(
        "An existing preview role is not safely owned by provisioning.",
      );
  } else {
    // Passwords are generated hexadecimal strings, never arbitrary SQL input.
    await client.query(
      `CREATE ROLE ${identifier(role)} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    await client.query(`COMMENT ON ROLE ${identifier(role)} IS '${marker}'`);
  }
  // Allow the provisioner to assign ownership and terminate only these roles' sessions at cleanup.
  await client.query(
    `GRANT ${identifier(role)} TO ${identifier(adminRole)} WITH INHERIT TRUE, SET TRUE`,
  );
}

export async function provisionDatabase(
  client: SqlClient,
  input: {
    number: number;
    headRef: string;
    title: string;
    passwordKey: string;
    adminRole: string;
  },
) {
  const names = previewNames(input.number, input.headRef, input.title);
  const appPassword = previewPassword(input.passwordKey, input.number, "app");
  const seedPassword = previewPassword(input.passwordKey, input.number, "seed");
  await client.query("SELECT pg_advisory_lock(216177610, $1)", [input.number]);
  try {
    await ensureRole(client, input.number, "app", appPassword, input.adminRole);
    await ensureRole(
      client,
      input.number,
      "seed",
      seedPassword,
      input.adminRole,
    );
    const existing = await ownedDatabase(client, input.number);
    const database = existing ?? names.database;
    if (!existing) {
      const collision = await client.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [database],
      );
      if (collision.rows.length)
        throw new Error(
          "The requested database already belongs to another role.",
        );
      await client.query(
        `CREATE DATABASE ${identifier(database)} OWNER ${identifier(names.appRole)} TEMPLATE template0 ALLOW_CONNECTIONS false`,
      );
    }
    await client.query(
      `REVOKE ALL ON DATABASE ${identifier(database)} FROM PUBLIC`,
    );
    await client.query(
      `GRANT CONNECT ON DATABASE ${identifier(database)} TO ${identifier(names.appRole)}, ${identifier(names.seedRole)}`,
    );
    // New databases stay closed until PUBLIC access is revoked; retries also reopen
    // a database left closed by an interrupted first provisioning attempt.
    await client.query(
      `ALTER DATABASE ${identifier(database)} ALLOW_CONNECTIONS true`,
    );
    return { ...names, database, appPassword, seedPassword };
  } finally {
    await client.query("SELECT pg_advisory_unlock(216177610, $1)", [
      input.number,
    ]);
  }
}

export async function cleanupDatabase(client: SqlClient, number: number) {
  prNumber(number);
  await client.query("SELECT pg_advisory_lock(216177610, $1)", [number]);
  try {
    const database = await ownedDatabase(client, number);
    for (const kind of ["seed", "app"] as const) {
      const name = `cashfolio_pr_${number}_${kind}`;
      const { rows } = await client.query<{ marker: string | null }>(
        "SELECT shobj_description(oid, 'pg_authid') AS marker FROM pg_roles WHERE rolname = $1",
        [name],
      );
      if (
        rows.length &&
        rows[0].marker !== `cashfolio-preview:${number}:${kind}`
      )
        throw new Error("Refusing to delete an unmanaged role.");
    }
    if (database)
      await client.query(`DROP DATABASE ${identifier(database)} WITH (FORCE)`);
    for (const kind of ["seed", "app"] as const)
      await client.query(
        `DROP ROLE IF EXISTS ${identifier(`cashfolio_pr_${number}_${kind}`)}`,
      );
  } finally {
    await client.query("SELECT pg_advisory_unlock(216177610, $1)", [number]);
  }
}
