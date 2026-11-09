import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  cleanupHistory,
  ensureAuthorizedForAccountBookId,
  getPeriodHistory,
  loadHistoryOpeningBalancePoint,
  loadPeriodHistoryPoint,
  resetHistory,
  revisionQuery,
  withResourceRequest,
} from "./period-history.test-support";

describe("getPeriodHistory", () => {
  test("preserves structured revision conflicts when RPC handles the thrown error", async () => {
    revisionQuery.mockResolvedValue({ periodCacheRevision: "changed" });
    const response = await withResourceRequest(
      new AbortController().signal,
      async () => {
        try {
          await getPeriodHistory({
            data: { accountBookId: "book-1", granularity: "month" },
          });
          return new Response("History loaded");
        } catch {
          // Start catches handler errors before returning its RPC response.
          return new Response("Serialized RPC error", { status: 500 });
        }
      },
    );
    expect(response.status).toBe(409);
    expect(response.headers.get("X-Cashfolio-Resource-Limit")).toBe(
      "history_revision_changed",
    );
    expect(response.headers.get("Retry-After")).toBe("0");
    expect(await response.text()).toContain("account book changed");
  });

  test("paginates smaller windows and calculates opening balances only at the beginning", async () => {
    const newest = await getPeriodHistory({
      data: { accountBookId: "book-1", granularity: "month", pageSize: 1 },
    });
    expect(newest.points.map((point) => point.periodValue)).toEqual([
      "2026-03",
    ]);
    expect(newest.nextBefore).toBe("2026-03");
    expect(newest.openingBalancePoint).toBeNull();
    expect(loadHistoryOpeningBalancePoint).not.toHaveBeenCalled();
    const oldest = await getPeriodHistory({
      data: {
        accountBookId: "book-1",
        granularity: "month",
        pageSize: 2,
        before: newest.nextBefore,
      },
    });
    expect(oldest.points.map((point) => point.periodValue)).toEqual([
      "2026-01",
      "2026-02",
    ]);
    expect(oldest.nextBefore).toBeUndefined();
    expect(oldest.openingBalancePoint).not.toBeNull();
    expect(loadHistoryOpeningBalancePoint).toHaveBeenCalledOnce();
  });

  test("rejects invalid page sizes before authorization or loading", async () => {
    await expect(
      getPeriodHistory({
        data: { accountBookId: "book-1", granularity: "year", pageSize: 101 },
      }),
    ).rejects.toThrow("window size");
    expect(ensureAuthorizedForAccountBookId).not.toHaveBeenCalled();
    expect(loadPeriodHistoryPoint).not.toHaveBeenCalled();
  });
  beforeEach(resetHistory);
  afterEach(cleanupHistory);

  test("rejects unsupported granularity", async () => {
    await expect(
      getPeriodHistory({
        data: {
          accountBookId: "book-1",
          granularity: "quarter",
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
