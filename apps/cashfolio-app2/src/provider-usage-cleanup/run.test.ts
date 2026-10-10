import { describe, expect, test, vi } from "vitest";
import {
  CLEANUP_TIMEOUT_MS,
  CleanupTimeoutError,
  cleanupProviderUsage,
  type CleanupStore,
} from "./run";

const now = new Date("2026-10-10T12:00:00Z");
const cutoff = new Date("2026-07-12T12:00:00Z");

function fixture(dates: Date[]) {
  const rows = [...dates];
  const store: CleanupStore = {
    deleteBatch: vi.fn(async (before, limit) => {
      const expired = rows.filter((date) => date < before).slice(0, limit);
      for (const date of expired) rows.splice(rows.indexOf(date), 1);
      return expired.length;
    }),
    hasExpired: vi.fn(async (before) => rows.some((date) => date < before)),
    tableSize: vi.fn(async () => 8_192),
  };
  return { rows, store };
}

describe("provider usage retention", () => {
  test("keeps boundary and newer rows with one fixed elapsed-day cutoff", async () => {
    const { rows, store } = fixture([
      new Date(cutoff.getTime() - 1),
      cutoff,
      now,
    ]);
    const summary = await cleanupProviderUsage(store, { now });
    expect(rows).toEqual([cutoff, now]);
    expect(summary).toMatchObject({
      status: "completed",
      cutoff: cutoff.toISOString(),
      deletedRows: 1,
      batchCount: 1,
      tableBytes: 8_192,
    });
  });

  test("deletes multiple bounded batches and is idempotent", async () => {
    const { store, rows } = fixture(
      Array.from({ length: 2_005 }, () => new Date("2020-01-01")),
    );
    const summary = await cleanupProviderUsage(store, { now });
    expect(summary.deletedRows).toBe(2_005);
    expect(summary.batchCount).toBe(3);
    expect(rows).toHaveLength(0);
    expect(store.deleteBatch).toHaveBeenCalledTimes(3);
    expect(store.deleteBatch).toHaveBeenCalledWith(
      cutoff,
      1_000,
      expect.any(Number),
    );
    const repeated = await cleanupProviderUsage(store, { now });
    expect(repeated).toMatchObject({ deletedRows: 0, batchCount: 0 });
  });

  test("finishes on an empty table", async () => {
    const { store } = fixture([]);
    await expect(cleanupProviderUsage(store, { now })).resolves.toMatchObject({
      status: "completed",
      deletedRows: 0,
    });
  });

  test("reports partial progress and fails at the deadline", async () => {
    const { store, rows } = fixture(
      Array.from({ length: 1_001 }, () => new Date("2020-01-01")),
    );
    let elapsed = 0;
    const deleteBatch = store.deleteBatch;
    store.deleteBatch = async (...args) => {
      const count = await deleteBatch(...args);
      elapsed = CLEANUP_TIMEOUT_MS;
      return count;
    };
    const report = vi.fn();
    await expect(
      cleanupProviderUsage(store, { now, clock: () => elapsed, report }),
    ).rejects.toBeInstanceOf(CleanupTimeoutError);
    expect(rows).toHaveLength(1);
    expect(report).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "incomplete",
        deletedRows: 1_000,
        batchCount: 1,
        elapsedMs: CLEANUP_TIMEOUT_MS,
      }),
    );
    await expect(cleanupProviderUsage(store, { now })).resolves.toMatchObject({
      deletedRows: 1,
    });
  });

  test("propagates database errors and reports committed progress", async () => {
    const { store } = fixture([new Date("2020-01-01")]);
    const error = new Error("private driver error");
    vi.mocked(store.hasExpired).mockRejectedValueOnce(error);
    const report = vi.fn();
    await expect(cleanupProviderUsage(store, { now, report })).rejects.toBe(
      error,
    );
    expect(report).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "failed",
        deletedRows: 1,
        batchCount: 1,
      }),
    );
    expect(JSON.stringify(report.mock.calls)).not.toContain(
      "private driver error",
    );
  });
});
