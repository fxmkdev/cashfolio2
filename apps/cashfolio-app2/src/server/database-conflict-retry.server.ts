import { setTimeout as delay } from "node:timers/promises";
import { Prisma } from "../.prisma-client/client";

const MAX_ATTEMPTS = 3;

function isDatabaseConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2034") return true;
  if (error.code !== "P2010") return false;
  const adapterError = error.meta?.driverAdapterError as
    { cause?: { originalCode?: string } } | undefined;
  return (
    error.meta?.code === "40P01" ||
    adapterError?.cause?.originalCode === "40P01"
  );
}

// Only wrap database operations that roll back atomically on conflict. Each
// attempt must create fresh transactions/promises; keep external effects outside.
export async function withDatabaseConflictRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isDatabaseConflict(error)) throw error;
      await delay(100 * attempt);
    }
  }
}
