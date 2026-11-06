import type { QueryResultRow } from "pg";
import type { NeonTarget } from "../../src/staging-seed/target.ts";
import { previewNames, prNumber } from "./names.ts";

export interface SqlClient {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}
type DatabaseHost = Pick<NeonTarget, "database" | "role">;

export function identifier(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,63}$/.test(value))
    throw new Error("Invalid database identifier.");
  return `"${value}"`;
}

async function previewDatabase(
  client: SqlClient,
  number: number,
  host: DatabaseHost,
) {
  prNumber(number);
  const { rows } = await client.query<{ name: string; owner: string }>(
    `SELECT datname AS name, pg_get_userbyid(datdba) AS owner FROM pg_database
     WHERE datname LIKE $1`,
    [`pr-${number}-%-cashfolio-app2`],
  );
  if (
    rows.length > 1 ||
    rows.some(
      ({ name, owner }) =>
        name === host.database ||
        owner !== host.role ||
        !new RegExp(`^pr-${number}-[a-z0-9-]+-cashfolio-app2$`).test(name),
    )
  )
    throw new Error(
      "Unexpected preview database name or ownership; operator review is required.",
    );
  return rows[0]?.name;
}

export async function provisionDatabase(
  client: SqlClient,
  input: { number: number; headRef: string; title: string; host: DatabaseHost },
) {
  const names = previewNames(input.number, input.headRef, input.title);
  await client.query("SELECT pg_advisory_lock(216177610, $1)", [input.number]);
  try {
    const existing = await previewDatabase(client, input.number, input.host);
    const database = existing ?? names.database;
    if (database === input.host.database)
      throw new Error("Staging cannot be used as a preview database.");
    if (!existing)
      await client.query(
        `CREATE DATABASE ${identifier(database)} TEMPLATE template0`,
      );
    return { ...names, database };
  } finally {
    await client.query("SELECT pg_advisory_unlock(216177610, $1)", [
      input.number,
    ]);
  }
}

export async function cleanupDatabase(
  client: SqlClient,
  number: number,
  host: DatabaseHost,
) {
  prNumber(number);
  await client.query("SELECT pg_advisory_lock(216177610, $1)", [number]);
  try {
    const database = await previewDatabase(client, number, host);
    if (database)
      await client.query(`DROP DATABASE ${identifier(database)} WITH (FORCE)`);
  } finally {
    await client.query("SELECT pg_advisory_unlock(216177610, $1)", [number]);
  }
}
