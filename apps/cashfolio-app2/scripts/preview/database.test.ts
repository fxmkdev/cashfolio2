import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupDatabase,
  provisionDatabase,
  type SqlClient,
} from "./database.ts";
const host = { database: "neondb", role: "owner" };
const input = { number: 42, headRef: "topic", title: "Test title", host };
function fake(
  options: {
    databases?: { name: string; owner: string }[];
    failCreate?: boolean;
  } = {},
) {
  const calls: string[] = [];
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push(sql);
      if (sql.includes("datname AS name")) {
        assert.deepEqual(values, ["pr-42-%-cashfolio-app2"]);
        return { rows: options.databases ?? [] };
      }
      if (sql.startsWith("CREATE DATABASE") && options.failCreate)
        throw new Error("create failed");
      return { rows: [] };
    },
  } as SqlClient;
  return { client, calls };
}
test("creates an empty PR database with the shared login, without changing roles or privileges", async () => {
  const { client, calls } = fake();
  const preview = await provisionDatabase(client, input);
  assert.equal(preview.database, "pr-42-test-title-cashfolio-app2");
  assert.deepEqual(
    calls.filter((sql) => sql.startsWith("CREATE")),
    ['CREATE DATABASE "pr-42-test-title-cashfolio-app2" TEMPLATE template0'],
  );
  assert.doesNotMatch(
    calls.join("\n"),
    /ROLE|GRANT|REVOKE|PASSWORD|ALTER DATABASE/,
  );
  assert.match(calls.at(-1)!, /pg_advisory_unlock/);
});
test("reuses the original database after a PR title edit", async () => {
  const name = "pr-42-original-title-cashfolio-app2";
  const { client, calls } = fake({ databases: [{ name, owner: host.role }] });
  assert.equal((await provisionDatabase(client, input)).database, name);
  assert.ok(!calls.some((sql) => sql.startsWith("CREATE")));
});
test("rejects ambiguous names, other owners, staging targets and invalid PRs without destructive SQL", async () => {
  const valid = { name: "pr-42-title-cashfolio-app2", owner: host.role };
  for (const databases of [
    [valid, { ...valid, name: "pr-42-other-cashfolio-app2" }],
    [{ ...valid, owner: "other" }],
    [{ name: host.database, owner: host.role }],
    [{ ...valid, name: "pr-43-title-cashfolio-app2" }],
    [{ ...valid, name: "production" }],
  ]) {
    for (const operation of ["provision", "cleanup"]) {
      const { client, calls } = fake({ databases });
      await assert.rejects(
        operation === "provision"
          ? provisionDatabase(client, input)
          : cleanupDatabase(client, 42, host),
      );
      assert.ok(!calls.some((sql) => /^(CREATE|DROP)/.test(sql)));
      assert.match(calls.at(-1)!, /pg_advisory_unlock/);
    }
  }
  const staging = { ...host, database: valid.name };
  const { client, calls } = fake({ databases: [valid] });
  await assert.rejects(cleanupDatabase(client, 42, staging));
  await assert.rejects(provisionDatabase(client, { ...input, host: staging }));
  assert.ok(!calls.some((sql) => /^(CREATE|DROP)/.test(sql)));
  await assert.rejects(cleanupDatabase(client, 0, host));
});
test("always releases the provisioning lock after database creation fails", async () => {
  const { client, calls } = fake({ failCreate: true });
  await assert.rejects(provisionDatabase(client, input), /create failed/);
  assert.match(calls.at(-1)!, /pg_advisory_unlock/);
});
test("cleanup drops only the requested PR database and is harmless when absent", async () => {
  const { client, calls } = fake({
    databases: [{ name: "pr-42-title-cashfolio-app2", owner: host.role }],
  });
  await cleanupDatabase(client, 42, host);
  assert.deepEqual(
    calls.filter((sql) => sql.startsWith("DROP")),
    ['DROP DATABASE "pr-42-title-cashfolio-app2" WITH (FORCE)'],
  );
  const missing = fake();
  await cleanupDatabase(missing.client, 42, host);
  assert.ok(!missing.calls.some((sql) => sql.startsWith("DROP")));
});
