import type { Prisma, PrismaClient } from "../.prisma-client/client";
import type { CleanupStore } from "./run";

export function createCleanupStore(client: PrismaClient): CleanupStore {
  // Each operation has its own bounded transaction; completed batches stay committed.
  async function query<T>(
    timeoutMs: number,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const maxWait = Math.max(1, Math.min(1_000, Math.floor(timeoutMs / 10)));
    const transactionTimeout = Math.max(1, timeoutMs - maxWait);
    return client.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT set_config('statement_timeout', ${String(transactionTimeout)}, true)
        `;
        await tx.$queryRaw`
          SELECT set_config('lock_timeout', ${String(Math.min(5_000, transactionTimeout))}, true)
        `;
        return operation(tx);
      },
      { maxWait, timeout: transactionTimeout },
    );
  }

  return {
    deleteBatch: (cutoff, limit, timeoutMs) =>
      query(
        timeoutMs,
        (tx) => tx.$executeRaw`
        WITH expired AS (
          SELECT "id" FROM "ValuationProviderRequest"
          WHERE "requestedAt" < ${cutoff}
          ORDER BY "requestedAt", "id"
          LIMIT ${limit}
        )
        DELETE FROM "ValuationProviderRequest" AS requests
        USING expired WHERE requests."id" = expired."id"
      `,
      ),
    hasExpired: (cutoff, timeoutMs) =>
      query(timeoutMs, async (tx) => {
        const rows = await tx.$queryRaw<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM "ValuationProviderRequest"
            WHERE "requestedAt" < ${cutoff}
          ) AS exists
        `;
        return rows[0].exists;
      }),
    tableSize: (timeoutMs) =>
      query(timeoutMs, async (tx) => {
        const rows = await tx.$queryRaw<{ bytes: bigint }[]>`
          SELECT pg_total_relation_size('"ValuationProviderRequest"'::regclass) AS bytes
        `;
        return Number(rows[0].bytes);
      }),
  };
}
