import { expect, test, vi } from "vitest";
import type { PrismaClient } from "../.prisma-client/client";
import { createCleanupStore } from "./store";

function fixture() {
  const transaction = {
    $executeRaw: vi.fn(
      async (_strings: TemplateStringsArray, ..._values: unknown[]) => 1_000,
    ),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      if (strings.join("").includes("pg_total_relation_size"))
        return [{ bytes: 8_192n }];
      if (strings.join("").includes("SELECT EXISTS"))
        return [{ exists: false }];
      return [];
    }),
  };
  const client = {
    $transaction: vi.fn(
      async (
        operation: (tx: typeof transaction) => Promise<unknown>,
        _options: { maxWait: number; timeout: number },
      ) => operation(transaction),
    ),
  };
  return {
    transaction,
    client,
    store: createCleanupStore(client as unknown as PrismaClient),
  };
}

test("bounds every independent transaction and parameterizes the exclusive cutoff", async () => {
  const { client, transaction, store } = fixture();
  const cutoff = new Date("2026-07-12T12:00:00Z");
  expect(await store.deleteBatch(cutoff, 1_000, 30_000)).toBe(1_000);
  expect(await store.hasExpired(cutoff, 5_000)).toBe(false);
  expect(await store.tableSize(1_000)).toBe(8_192);
  expect(client.$transaction).toHaveBeenCalledTimes(3);
  for (const [_operation, options] of client.$transaction.mock.calls) {
    expect(options.maxWait).toBeGreaterThan(0);
    expect(options.timeout).toBeGreaterThan(0);
    expect(options.maxWait + options.timeout).toBeLessThanOrEqual(30_000);
  }
  expect(transaction.$executeRaw).toHaveBeenCalledWith(
    expect.anything(),
    cutoff,
    1_000,
  );
  expect(transaction.$executeRaw.mock.calls[0][0].join("")).toContain(
    'ORDER BY "requestedAt", "id"',
  );
});

test("database errors propagate without rolling back earlier transactions", async () => {
  const { transaction, store } = fixture();
  await store.deleteBatch(new Date(), 1_000, 30_000);
  transaction.$executeRaw.mockRejectedValueOnce(new Error("database failure"));
  await expect(store.deleteBatch(new Date(), 1_000, 30_000)).rejects.toThrow(
    "database failure",
  );
  expect(transaction.$executeRaw).toHaveBeenCalledTimes(2);
});
