export const RETENTION_DAYS = 90;
export const CLEANUP_BATCH_SIZE = 1_000;
export const CLEANUP_TIMEOUT_MS = 5 * 60 * 1_000;
export const CLEANUP_LOG_PREFIX = "PROVIDER_USAGE_CLEANUP ";

export type CleanupSummary = {
  status: "running" | "completed" | "incomplete" | "failed";
  cutoff: string;
  deletedRows: number;
  batchCount: number;
  elapsedMs: number;
  tableBytes: number | null;
};

export type CleanupStore = {
  deleteBatch(cutoff: Date, limit: number, timeoutMs: number): Promise<number>;
  hasExpired(cutoff: Date, timeoutMs: number): Promise<boolean>;
  tableSize(timeoutMs: number): Promise<number>;
};

export class CleanupTimeoutError extends Error {
  constructor() {
    super("Provider usage cleanup exceeded its five-minute limit.");
  }
}

export async function cleanupProviderUsage(
  store: CleanupStore,
  options: {
    now?: Date;
    clock?: () => number;
    report?: (summary: CleanupSummary) => void;
  } = {},
): Promise<CleanupSummary> {
  const clock = options.clock ?? (() => performance.now());
  const startedAt = clock();
  const cutoff = new Date(
    (options.now ?? new Date()).getTime() - RETENTION_DAYS * 86_400_000,
  );
  const summary: CleanupSummary = {
    status: "running",
    cutoff: cutoff.toISOString(),
    deletedRows: 0,
    batchCount: 0,
    elapsedMs: 0,
    tableBytes: null,
  };
  const elapsed = () => Math.max(0, Math.round(clock() - startedAt));
  const remaining = () => {
    const duration = CLEANUP_TIMEOUT_MS - elapsed();
    if (duration <= 0) throw new CleanupTimeoutError();
    return Math.min(duration, 30_000);
  };
  const report = () => {
    summary.elapsedMs = elapsed();
    options.report?.({ ...summary });
  };

  try {
    summary.tableBytes = await store.tableSize(remaining());
    report();
    while (true) {
      const deleted = await store.deleteBatch(
        cutoff,
        CLEANUP_BATCH_SIZE,
        remaining(),
      );
      summary.deletedRows += deleted;
      if (deleted > 0) summary.batchCount++;
      report();
      // An empty batch proves completion without another query at the deadline.
      if (deleted === 0) break;
      if (!(await store.hasExpired(cutoff, remaining()))) break;
    }
    summary.tableBytes = await store.tableSize(remaining());
    summary.status = "completed";
    report();
    return { ...summary };
  } catch (error) {
    summary.status =
      error instanceof CleanupTimeoutError ? "incomplete" : "failed";
    report();
    throw error;
  }
}
