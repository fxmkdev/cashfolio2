import { describe, expect, it, vi } from "vitest";
import { Temporal } from "@/shared/temporal";
import { historyBatch, historyRequest } from "./-history-loading.test-support";
import {
  loadCompleteHistory,
  type HistoryBatchRequest,
  type HistoryLoadSnapshot,
} from "./-history-loading";
import {
  createHistoryLoadRequest,
  getHistoryDataSelection,
  selectHistoryDisplayScopes,
} from "./-data-selection";
import {
  addRollingAverageMetricToChartData,
  getHistoryDefaultRange,
  mapHistoryPointsToChartData,
  rebaseHistoryChartDataCumulativeToVisibleRange,
} from "./-chart-data";

const months = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    Temporal.PlainYearMonth.from("2026-12")
      .subtract({ months: count - index - 1 })
      .toString(),
  );

describe("progressive History loading", () => {
  it.each([36, 120])(
    "publishes after two batches regardless of the book's %i months",
    async (count) => {
      const values = months(count);
      let firstPublishedAfter: number | undefined;
      const fetch = vi.fn(async ({ before, pageSize }: HistoryBatchRequest) => {
        const end = before ? values.indexOf(before) : values.length;
        const start = Math.max(0, end - pageSize);
        return historyBatch(
          values.slice(start, end),
          start > 0 ? values[start] : undefined,
        );
      });
      await loadCompleteHistory(
        historyRequest,
        fetch,
        new AbortController().signal,
        () => {
          firstPublishedAfter ??= fetch.mock.calls.length;
        },
      );
      expect(firstPublishedAfter).toBe(2);
      expect(fetch).toHaveBeenCalledTimes(count / 12);
    },
  );

  it.each(["cancel", "revision"])(
    "does not publish newer data after a background %s failure",
    async (failure) => {
      const values = months(36);
      const controller = new AbortController();
      const snapshots: HistoryLoadSnapshot[] = [];
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(historyBatch(values.slice(24), values[24]))
        .mockResolvedValueOnce(historyBatch(values.slice(12, 24), values[12]))
        .mockResolvedValueOnce(
          historyBatch(values.slice(0, 12), undefined, "changed"),
        );
      const load = loadCompleteHistory(
        historyRequest,
        fetch,
        controller.signal,
        (snapshot) => {
          snapshots.push(snapshot);
          if (failure === "cancel") controller.abort();
        },
      );
      await expect(load).rejects.toThrow(
        failure === "cancel" ? /abort/i : /account book changed/,
      );
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].complete).toBe(false);
      expect(snapshots[0].revision).toBe("r1");
      expect(fetch).toHaveBeenCalledTimes(failure === "cancel" ? 2 : 3);
    },
  );

  it.each(["month", "year"] as const)(
    "publishes a stable recent %s window before a delayed older batch",
    async (mode) => {
      const values =
        mode === "month"
          ? months(36)
          : Array.from({ length: 15 }, (_, i) => String(2012 + i));
      const size = mode === "month" ? 12 : 5;
      const newest = historyBatch(values.slice(-size), values.at(-size));
      const middle = historyBatch(
        values.slice(-size * 2, -size),
        values.at(-size * 2),
      );
      const oldest = historyBatch(values.slice(0, -size * 2));
      let release!: () => void;
      let ready!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const fetch = vi
        .fn<(request: HistoryBatchRequest) => Promise<typeof newest>>()
        .mockResolvedValueOnce(newest)
        .mockResolvedValueOnce(middle)
        .mockImplementationOnce(async () => {
          ready();
          await gate;
          return oldest;
        });
      const snapshots: HistoryLoadSnapshot[] = [];
      const loading = loadCompleteHistory(
        { ...historyRequest, mode },
        fetch,
        new AbortController().signal,
        (snapshot) => snapshots.push(snapshot),
      );
      await started;
      try {
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0]).toMatchObject({
          complete: false,
          revision: "r1",
          history: { openingBalancePoint: null },
        });
        expect(snapshots[0].history.points).toHaveLength(size * 2);
      } finally {
        release();
      }
      const complete = await loading;
      expect(snapshots.at(-1)).toMatchObject({ complete: true });
      expect(complete.points.map((point) => point.periodValue)).toEqual(values);
      {
        const data = (points: typeof complete.points) =>
          addRollingAverageMetricToChartData({
            chartData: mapHistoryPointsToChartData(points),
            selectedMetric: "income",
            periodMode: mode,
          });
        const recent = data(snapshots[0].history.points);
        const full = data(complete.points);
        const range = getHistoryDefaultRange({
          chartData: recent,
          selectedMetric: "income",
          periodMode: mode,
        })!;
        expect(
          getHistoryDefaultRange({
            chartData: full,
            selectedMetric: "income",
            periodMode: mode,
          }),
        ).toEqual(range);
        const visible = { start: range.start.value, end: range.end.value };
        const recentCumulative = rebaseHistoryChartDataCumulativeToVisibleRange(
          {
            chartData: recent,
            visibleRangeX: visible,
            selectedMetric: "income",
          },
        );
        const fullCumulative = rebaseHistoryChartDataCumulativeToVisibleRange({
          chartData: full,
          visibleRangeX: visible,
          selectedMetric: "income",
        });
        expect(recentCumulative.slice(-(size + 1))).toEqual(
          fullCumulative.slice(-(size + 1)),
        );
      }
    },
  );

  it("retains the published snapshot when an older batch fails", async () => {
    const values = months(36);
    const progress = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(historyBatch(values.slice(-12), values.at(-12)))
      .mockResolvedValueOnce(historyBatch(values.slice(12, 24), values[12]))
      .mockRejectedValueOnce(new Error("older failed"));
    await expect(
      loadCompleteHistory(
        historyRequest,
        fetch,
        new AbortController().signal,
        progress,
      ),
    ).rejects.toThrow("older failed");
    expect(progress).toHaveBeenCalledOnce();
    expect(progress.mock.calls[0][0].history.points).toHaveLength(24);
  });

  it("waits for a scoped selection found only in older history", async () => {
    const values = months(36);
    const batches = [
      historyBatch(values.slice(24), values[24]),
      historyBatch(values.slice(12, 24), values[12]),
      historyBatch(values.slice(0, 12)),
    ];
    for (const batch of batches) batch.scopeSelection.income = "account:older";
    batches[2].scopeOptions.income.push({
      value: "account:older",
      label: "Older",
      kind: "account",
    });
    const progress = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(batches[0])
      .mockResolvedValueOnce(batches[1])
      .mockResolvedValueOnce(batches[2]);
    await loadCompleteHistory(
      {
        ...historyRequest,
        scopedMetric: "income",
        incomeScope: "account:older",
      },
      fetch,
      new AbortController().signal,
      progress,
    );
    expect(progress).toHaveBeenCalledOnce();
    expect(progress.mock.calls[0][0].complete).toBe(true);
  });

  it("uses one identity for aggregate metrics and ignores inactive saved scopes", () => {
    expect(
      getHistoryDataSelection({
        metric: "income",
        expenseScope: "account:saved",
      }),
    ).toEqual(getHistoryDataSelection({ metric: "assets" }));
    expect(
      createHistoryLoadRequest({
        ...getHistoryDataSelection({
          metric: "expenses",
          expenseScope: "account:expense",
          incomeScope: "account:saved",
        }),
        accountBookId: "book",
        locale: "en-CH",
      }),
    ).toMatchObject({
      scopedMetric: "expenses",
      expenseScope: "account:expense",
      incomeScope: "total",
    });
  });

  it("keeps inactive scopes until the complete option set is available", () => {
    const history = historyBatch(["2026-12"], "2026-12");
    const search = {
      metric: "assets" as const,
      incomeScope: "account:older" as const,
    };
    expect(
      selectHistoryDisplayScopes(history, search, false).scopeSelection.income,
    ).toBe("account:older");
    expect(
      selectHistoryDisplayScopes(history, search, true).scopeSelection.income,
    ).toBe("total");
  });
});
