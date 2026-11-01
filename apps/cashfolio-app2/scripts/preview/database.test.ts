import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupDatabase,
  provisionDatabase,
  type SqlClient,
} from "./database.ts";
const input = {
  number: 42,
  headRef: "topic",
  title: "Test title",
  passwordKey: "ab".repeat(32),
  adminRole: "provisioner",
};
function fake(
  options: {
    database?: string;
    unsafeRole?: boolean;
    collision?: boolean;
    failCreate?: boolean;
  } = {},
) {
  const calls: string[] = [];
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push(sql);
      if (sql.includes("NOT (rolsuper"))
        return {
          rows: options.unsafeRole ? [{ safe: false, marker: null }] : [],
        };
      if (sql.includes("shobj_description"))
        return {
          rows: [
            {
              marker: `cashfolio-preview:42:${String(values?.[0]).endsWith("_seed") ? "seed" : "app"}`,
            },
          ],
        };
      if (sql.includes("datname AS name"))
        return { rows: options.database ? [{ name: options.database }] : [] };
      if (sql.includes("SELECT 1 FROM pg_database"))
        return { rows: options.collision ? [{}] : [] };
      if (sql.startsWith("CREATE DATABASE") && options.failCreate)
        throw new Error("create failed");
      return { rows: [] };
    },
  } as SqlClient;
  return { client, calls };
}
test("creates only the PR database and restricted SQL roles, with public access revoked", async () => {
  const { client, calls } = fake();
  const preview = await provisionDatabase(client, input);
  assert.equal(preview.database, "pr-42-test-title-cashfolio-app2");
  assert.ok(
    calls.some(
      (sql) =>
        sql.startsWith("CREATE DATABASE") &&
        sql.endsWith("ALLOW_CONNECTIONS false"),
    ),
  );
  const open = calls.findIndex(
    (sql) =>
      sql.startsWith("ALTER DATABASE") &&
      sql.endsWith("ALLOW_CONNECTIONS true"),
  );
  assert.ok(
    open > calls.findIndex((sql) => sql.startsWith("REVOKE ALL ON DATABASE")),
  );
  assert.ok(
    open >
      calls.findIndex((sql) => sql.startsWith("GRANT CONNECT ON DATABASE")),
  );
  assert.equal(calls.filter((sql) => sql.startsWith("CREATE ROLE")).length, 2);
  assert.ok(
    calls.some((sql) => sql.includes("NOCREATEROLE NOREPLICATION NOBYPASSRLS")),
  );
  assert.ok(calls.some((sql) => sql.startsWith("REVOKE ALL ON DATABASE")));
  assert.ok(!calls.some((sql) => /ALTER ROLE|neon_superuser/.test(sql)));
  assert.match(calls.at(-1)!, /pg_advisory_unlock/);
});
test("reuses the original database after a PR title edit without recreation", async () => {
  const { client, calls } = fake({
    database: "pr-42-original-title-cashfolio-app2",
  });
  assert.equal(
    (await provisionDatabase(client, input)).database,
    "pr-42-original-title-cashfolio-app2",
  );
  assert.ok(!calls.some((sql) => sql.startsWith("CREATE DATABASE")));
});
test("refuses unsafe roles, unexpected ownership and name collisions and always unlocks", async () => {
  for (const options of [
    { unsafeRole: true },
    { database: "production" },
    { collision: true },
    { failCreate: true },
  ]) {
    const { client, calls } = fake(options);
    await assert.rejects(provisionDatabase(client, input));
    assert.match(calls.at(-1)!, /pg_advisory_unlock/);
    assert.ok(!calls.some((sql) => sql.startsWith("DROP")));
  }
});
test("cleanup removes the owned database before its roles, and refuses other names", async () => {
  const { client, calls } = fake({ database: "pr-42-title-cashfolio-app2" });
  await cleanupDatabase(client, 42);
  const drop = calls.filter((sql) => sql.startsWith("DROP"));
  assert.match(drop[0], /^DROP DATABASE/);
  assert.equal(drop.length, 3);
  for (const database of [
    "production",
    "staging",
    "neondb",
    "cashfolio_preview_control",
    "pr-43-title-cashfolio-app2",
  ]) {
    const unsafe = fake({ database });
    await assert.rejects(cleanupDatabase(unsafe.client, 42));
    assert.ok(!unsafe.calls.some((sql) => sql.startsWith("DROP")));
  }
});
