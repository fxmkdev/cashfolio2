import { describe, expect, it, vi } from "vitest";
import type { PeriodHistoryBatchResponse } from "@/server/period-history";
import { ResourceLimitError } from "@/shared/resource-error";
import {
  loadCompleteHistory,
  type HistoryBatchRequest,
  type HistoryLoadRequest,
} from "./-history-loading";

export const historyRequest: HistoryLoadRequest = {
  accountBookId: "book",
  mode: "month",
  locale: "en-CH",
  cashFlowScope: "total",
  incomeScope: "total",
  expenseScope: "total",
  gainLossScope: "total",
  netWorthScope: "total",
};
export function historyBatch(
  periods: string[],
  nextBefore?: string,
  revision = "r1",
): PeriodHistoryBatchResponse {
  const total = {
    value: "total" as const,
    kind: "total" as const,
    label: "Total",
  };
  return {
    revision,
    nextBefore,
    referenceCurrency: "CHF",
    hasCashAccounts: true,
    openingBalancePoint: nextBefore
      ? null
      : {
          date: "2000-01-01",
          label: "Opening Balance",
          assets: 1,
          liabilities: 0,
          netWorth: 1,
        },
    points: periods.map((periodValue) => ({
      periodValue,
      periodLabel: periodValue,
      periodEndDate: `${periodValue}-28`,
      assets: 1,
      liabilities: 0,
      netWorth: 1,
      totalReturn: 1,
      savings: 1,
      cashFlow: 1,
      income: 1,
      expenses: 0,
      gainsLosses: 0,
    })),
    scopeSelection: {
      cashFlow: "total",
      income: "total",
      expenses: "total",
      gainsLosses: "total",
      netWorth: "total",
    },
    scopeOptions: {
      cashFlow: [total],
      income: [total],
      expenses: [total],
      gainsLosses: [total],
      netWorth: [total],
    },
  };
}
const fetcher = () =>
  vi.fn<
    (request: HistoryBatchRequest) => Promise<PeriodHistoryBatchResponse>
  >();
const signal = () => new AbortController().signal;

describe("automatic complete History loading", () => {
  it("retains investment grouping and selection found only in older batches", async () => {
    const scope = "gain-loss-investment:EQUITIES:managed-portfolios" as const;
    const newest = historyBatch(["2026-02"], "2026-02");
    const oldest = historyBatch(["2026-01"]);
    newest.scopeSelection.gainsLosses = oldest.scopeSelection.gainsLosses =
      scope;
    const investment = {
      value: scope,
      label: "Equities / Managed Portfolios",
      treeLabel: "Managed Portfolios",
      kind: "gainLoss" as const,
      grouping: "assetClass" as const,
      parentValue: "asset-class:EQUITIES" as const,
    };
    oldest.scopeOptions.gainsLosses.push(
      {
        value: "asset-class:EQUITIES",
        label: "Equities",
        kind: "gainLoss",
        grouping: "assetClass",
      },
      investment,
    );
    const fetch = fetcher()
      .mockResolvedValueOnce(newest)
      .mockResolvedValueOnce(oldest);
    const history = await loadCompleteHistory(
      { ...historyRequest, scopedMetric: "gainsLosses", gainLossScope: scope },
      fetch,
      signal(),
    );
    expect(history.scopeSelection.gainsLosses).toBe(scope);
    expect(history.scopeOptions.gainsLosses).toContainEqual(investment);
    expect(history.points).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("publishes only complete data, merges chronological points/scopes, and retains the opening balance", async () => {
    const latest = historyBatch(["2026-02", "2026-03"], "2026-02");
    latest.scopeOptions.income.push({
      value: "account:z",
      kind: "account",
      label: "Z",
    });
    const older = historyBatch(["2026-01", "2026-02"]);
    older.scopeOptions.income.push({
      value: "account:a",
      kind: "account",
      label: "A",
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const fetch = fetcher()
      .mockResolvedValueOnce(latest)
      .mockImplementationOnce(async () => {
        ready();
        await gate;
        return older;
      });
    let published = false;
    const result = loadCompleteHistory(historyRequest, fetch, signal()).then(
      (history) => {
        published = true;
        return history;
      },
    );
    await started;
    expect(published).toBe(false);
    release();
    const history = await result;
    expect(history.points.map((point) => point.periodValue)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(history.scopeOptions.income.map((option) => option.label)).toEqual([
      "Total",
      "A",
      "Z",
    ]);
    expect(history.openingBalancePoint).toEqual(older.openingBalancePoint);
    expect(history).not.toHaveProperty("nextBefore");
    expect(history).not.toHaveProperty("revision");
    expect(fetch.mock.calls.map(([args]) => args.before)).toEqual([
      undefined,
      "2026-02",
    ]);
  });

  it("shrinks the failed cursor and retains the smaller size", async () => {
    const fetch = fetcher()
      .mockResolvedValueOnce(historyBatch(["2026-03"], "2026-03"))
      .mockRejectedValueOnce(
        new ResourceLimitError("budget", 429, 1, "provider_request_limit"),
      )
      .mockResolvedValueOnce(historyBatch(["2026-02"], "2026-02"))
      .mockResolvedValueOnce(historyBatch(["2026-01"]));
    await loadCompleteHistory(historyRequest, fetch, signal());
    expect(
      fetch.mock.calls.map(([args]) => [args.before, args.pageSize]),
    ).toEqual([
      [undefined, 12],
      ["2026-03", 12],
      ["2026-03", 6],
      ["2026-02", 6],
    ]);
  });

  it.each(["provider_request_limit", "read_deadline"] as const)(
    "stops at one period for %s",
    async (code) => {
      const fetch = fetcher().mockRejectedValue(
        new ResourceLimitError(
          "budget",
          code === "read_deadline" ? 503 : 429,
          1,
          code,
        ),
      );
      await expect(
        loadCompleteHistory(historyRequest, fetch, signal()),
      ).rejects.toThrow("calculation limits");
      expect(fetch.mock.calls.map(([args]) => args.pageSize)).toEqual([
        12, 6, 3, 1,
      ]);
    },
  );

  it("starts yearly batches at five and rounds shrinking down", async () => {
    const fetch = fetcher()
      .mockRejectedValueOnce(
        new ResourceLimitError("budget", 503, 1, "read_deadline"),
      )
      .mockResolvedValueOnce(historyBatch(["2026"]));
    await loadCompleteHistory(
      { ...historyRequest, mode: "year" },
      fetch,
      signal(),
    );
    expect(fetch.mock.calls.map(([args]) => args.pageSize)).toEqual([5, 2]);
  });

  it.each([new Error("network"), new ResourceLimitError("unknown", 429)])(
    "stops on %s and restarts the whole load on explicit retry",
    async (failure) => {
      const fetch = fetcher()
        .mockResolvedValueOnce(historyBatch(["2026-04"], "2026-04"))
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce(historyBatch(["2026-03"], "2026-03"))
        .mockResolvedValueOnce(historyBatch(["2026-02"]));
      await expect(
        loadCompleteHistory(historyRequest, fetch, signal()),
      ).rejects.toBe(failure);
      expect(fetch).toHaveBeenCalledTimes(2);
      const history = await loadCompleteHistory(
        historyRequest,
        fetch,
        signal(),
      );
      expect(fetch.mock.calls[2][0]).toMatchObject({
        before: undefined,
        pageSize: 12,
      });
      expect(history.points.map((point) => point.periodValue)).toEqual([
        "2026-02",
        "2026-03",
      ]);
    },
  );

  it("resets an adaptively reduced size on explicit retry", async () => {
    const fetch = fetcher()
      .mockRejectedValueOnce(
        new ResourceLimitError("budget", 429, 1, "provider_request_limit"),
      )
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(historyBatch(["2026-01"]));
    await expect(
      loadCompleteHistory(historyRequest, fetch, signal()),
    ).rejects.toThrow("network");
    await loadCompleteHistory(historyRequest, fetch, signal());
    expect(fetch.mock.calls.map(([args]) => args.pageSize)).toEqual([
      12, 6, 12,
    ]);
  });

  it("discards late data after cancellation and starts subsequent loads fresh", async () => {
    const controller = new AbortController();
    let release!: (value: PeriodHistoryBatchResponse) => void;
    const fetch = fetcher()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValueOnce(historyBatch(["2026-01"]));
    const aborted = loadCompleteHistory(
      historyRequest,
      fetch,
      controller.signal,
    ).catch((error: unknown) => error);
    controller.abort();
    release(historyBatch(["2026-03"], "2026-03"));
    expect(await aborted).toBe(controller.signal.reason);
    expect(fetch).toHaveBeenCalledOnce();
    expect(
      (await loadCompleteHistory(historyRequest, fetch, signal())).points[0]
        .periodValue,
    ).toBe("2026-01");
  });

  it("does not fetch when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = fetcher();
    await expect(
      loadCompleteHistory(historyRequest, fetch, controller.signal),
    ).rejects.toBe(controller.signal.reason);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects mixed revisions without automatically restarting", async () => {
    const fetch = fetcher()
      .mockResolvedValueOnce(historyBatch(["2026-03"], "2026-03", "old"))
      .mockResolvedValueOnce(historyBatch(["2026-02"], undefined, "new"));
    await expect(
      loadCompleteHistory(historyRequest, fetch, signal()),
    ).rejects.toThrow("account book changed");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not automatically retry server revision errors", async () => {
    const failure = new ResourceLimitError(
      "Book changed. Please retry.",
      409,
      0,
      "history_revision_changed",
    );
    const fetch = fetcher().mockRejectedValue(failure);
    await expect(
      loadCompleteHistory(historyRequest, fetch, signal()),
    ).rejects.toBe(failure);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("validates revision, continuation, and opening balance before publication", async () => {
    const fetch = fetcher().mockResolvedValue({
      ...historyBatch([]),
      revision: "",
    });
    await expect(
      loadCompleteHistory(historyRequest, fetch, signal()),
    ).rejects.toThrow("revision");
    fetch.mockResolvedValue(historyBatch(["2026-03"], "2026-03"));
    await expect(
      loadCompleteHistory(historyRequest, fetch, signal()),
    ).rejects.toThrow("continuation");
    fetch.mockResolvedValue({ ...historyBatch([]), openingBalancePoint: null });
    await expect(
      loadCompleteHistory(historyRequest, fetch, signal()),
    ).rejects.toThrow("opening balance");
  });

  it("normalizes invalid calculation scopes after merging, then reloads before publication", async () => {
    const invalid = historyBatch(["2026-01"]);
    invalid.scopeSelection.income = "account:missing";
    invalid.points[0].income = 0;
    const fetch = fetcher()
      .mockResolvedValueOnce(invalid)
      .mockResolvedValueOnce(historyBatch(["2026-01"]));
    const history = await loadCompleteHistory(
      {
        ...historyRequest,
        incomeScope: "account:missing",
        scopedMetric: "income",
      },
      fetch,
      signal(),
    );
    expect(history.points[0].income).toBe(1);
    expect(fetch.mock.calls[1][0].incomeScope).toBe("total");
  });

  it("stops if calculation scope normalization cannot stabilize", async () => {
    const invalid = historyBatch(["2026-01"]);
    invalid.scopeSelection.income = "account:missing";
    const fetch = fetcher().mockResolvedValue(invalid);
    await expect(
      loadCompleteHistory(
        {
          ...historyRequest,
          incomeScope: "account:missing",
          scopedMetric: "income",
        },
        fetch,
        signal(),
      ),
    ).rejects.toThrow("scopes changed");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retains scopes found only in older batches", async () => {
    const newest = historyBatch(["2026-02"], "2026-02");
    const oldest = historyBatch(["2026-01"]);
    newest.scopeSelection.income = oldest.scopeSelection.income =
      "account:older";
    oldest.scopeOptions.income.push({
      value: "account:older",
      label: "Older",
      kind: "account",
    });
    const fetch = fetcher()
      .mockResolvedValueOnce(newest)
      .mockResolvedValueOnce(oldest);
    const history = await loadCompleteHistory(
      { ...historyRequest, incomeScope: "account:older" },
      fetch,
      signal(),
    );
    expect(history.scopeSelection.income).toBe("account:older");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("normalizes inactive scopes without unnecessary recalculation", async () => {
    const batch = historyBatch(["2026-01"]);
    batch.scopeSelection.income = "account:missing";
    const fetch = fetcher().mockResolvedValueOnce(batch);
    const history = await loadCompleteHistory(
      { ...historyRequest, incomeScope: "account:missing" },
      fetch,
      signal(),
    );
    expect(history.scopeSelection.income).toBe("total");
    expect(fetch).toHaveBeenCalledOnce();
  });
});
