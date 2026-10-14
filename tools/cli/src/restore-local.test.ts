import assert from "node:assert/strict";
import { test } from "node:test";
import { restoreLocal } from "./restore-local";

function setup(failure?: "restore" | "connect" | "scan" | "delete" | "close") {
  const calls: string[] = [];
  const logs: string[] = [];
  const error = new Error(`${failure} failed`);
  const redis = {
    isOpen: false,
    async connect() {
      calls.push("connect");
      this.isOpen = true;
      if (failure === "connect") throw error;
    },
    async close() {
      calls.push("close");
      this.isOpen = false;
      if (failure === "close") throw error;
    },
    async *scanIterator({ MATCH }: { MATCH: string; COUNT: number }) {
      calls.push("scan");
      if (failure === "scan") throw error;
      if (MATCH === "account-book:*") yield ["account-book:1"];
    },
    async del() {
      calls.push("delete");
      if (failure === "delete") throw error;
      return 1;
    },
  };
  const deps = {
    env: {
      RESTORE_DB_URL: "postgresql://localhost",
      RESTORE_DB_NAME: "local",
      RESTORE_REDIS_URL: " redis://localhost:6379 ",
    },
    async exec(command: string) {
      calls.push(command);
      if (command.startsWith("pg_restore") && failure === "restore")
        throw error;
    },
    createRedisClient(url: string) {
      assert.equal(url, "redis://localhost:6379");
      calls.push("create-client");
      return redis;
    },
    log(message: string) {
      logs.push(message);
    },
  };
  return { calls, logs, error, deps };
}

test("restores before cleanup, closes Redis and logs the actual deletion count", async () => {
  const { calls, logs, deps } = setup();
  await restoreLocal(deps);
  assert.deepEqual(calls.slice(0, 3), [
    'psql -d "postgresql://localhost" -c "DROP DATABASE IF EXISTS local WITH (FORCE)"',
    'psql -d "postgresql://localhost" -c "CREATE DATABASE local"',
    'pg_restore --no-owner --no-privileges -d "postgresql://localhost/local" ./backup.dump',
  ]);
  assert.equal(calls[3], "create-client");
  assert.equal(calls.at(-1), "close");
  assert.ok(logs.includes("Deleted 1 book-scoped cache keys"));
  assert.equal(logs.at(-1), "Done");
});

for (const url of [undefined, "", "   "]) {
  test(`rejects missing Redis configuration before any destructive work (${JSON.stringify(url)})`, async () => {
    const { calls, logs, deps } = setup();
    await assert.rejects(
      restoreLocal({ ...deps, env: { ...deps.env, RESTORE_REDIS_URL: url } }),
      /RESTORE_REDIS_URL must be set/,
    );
    assert.deepEqual(calls, []);
    assert.deepEqual(logs, []);
  });
}

for (const failure of [
  "restore",
  "connect",
  "scan",
  "delete",
  "close",
] as const) {
  test(`fails without a success message when ${failure} fails`, async () => {
    const { calls, logs, deps, error } = setup(failure);
    await assert.rejects(restoreLocal(deps), (actual) => actual === error);
    assert.ok(!logs.includes("Done"));
    if (failure === "restore") assert.ok(!calls.includes("create-client"));
    else assert.equal(calls.at(-1), "close");
  });
}
