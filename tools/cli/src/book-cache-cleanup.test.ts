import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deleteRestoreBookCaches,
  type BookCacheRedisClient,
} from "./book-cache-cleanup";

function matches(pattern: string, key: string) {
  const regex = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${regex}$`).test(key);
}

test("clears legacy and all versioned book caches while retaining global caches", async () => {
  const removed = [
    "account-book:legacy:balance",
    ...["v1", "v2", "v6", "v7", "v8", "v99"].flatMap((v) => [
      `period:base:${v}:local:book-1:revision:2026-01`,
      `period:base:index:${v}:preview:book-2:revision`,
      `period:base:generation:${v}:staging:book-3`,
      `period:history:metrics:${v}:local:book-4:revision:2026-01:total`,
      `account:gain-loss:${v}:preview:book-5:revision:2026-05-11:2026-05-10`,
      `account:gain-loss-basis:${v}:preview:book-5:revision:2026-05-10`,
    ]),
  ];
  const preserved = [
    "valuation:currencylayer:USD:CHF",
    "valuation:coinlayer:fallback:USD:BTC:123",
    "valuation:marketstack:TEST:USD",
    "valuation:miss-cooldown:test:123",
    "session:user",
    "period:unrelated",
  ];
  const keys = new Set([...removed, ...preserved]);
  const redis: BookCacheRedisClient = {
    async *scanIterator(options) {
      assert.equal(options.COUNT, 100);
      yield [];
      for (const key of [...keys]) if (matches(options.MATCH, key)) yield [key];
    },
    async del(batch) {
      return batch.reduce((count, key) => count + Number(keys.delete(key)), 0);
    },
  };
  assert.equal(await deleteRestoreBookCaches(redis), removed.length);
  assert.deepEqual([...keys], preserved);
});

test("bounds deletion batches even when SCAN returns more than its count hint", async () => {
  const keys = Array.from({ length: 251 }, (_, i) => `account-book:${i}`);
  const remaining = new Set(keys);
  const sizes: number[] = [];
  const redis: BookCacheRedisClient = {
    async *scanIterator({ MATCH }) {
      if (MATCH === "account-book:*") {
        yield [];
        yield keys;
        yield keys[0]!;
      }
    },
    async del(batch) {
      sizes.push(batch.length);
      return batch.reduce(
        (count, key) => count + Number(remaining.delete(key)),
        0,
      );
    },
  };
  assert.equal(await deleteRestoreBookCaches(redis), 251);
  assert.deepEqual(sizes, [100, 100, 51, 1]);
});

test("returns zero without deleting when every scan is empty", async () => {
  assert.equal(
    await deleteRestoreBookCaches({
      async *scanIterator() {
        yield [];
      },
      async del() {
        assert.fail("Unexpected deletion");
      },
    }),
    0,
  );
});

for (const command of ["scan", "delete"] as const) {
  test(`propagates ${command} failures`, async () => {
    const error = new Error(`${command} failed`);
    await assert.rejects(
      deleteRestoreBookCaches({
        async *scanIterator() {
          if (command === "scan") throw error;
          yield ["account-book:1"];
        },
        async del() {
          throw error;
        },
      }),
      (actual) => actual === error,
    );
  });
}
