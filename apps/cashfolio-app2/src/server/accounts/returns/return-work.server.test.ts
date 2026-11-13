import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  stagingReturnInputs,
  stagingReturnRate,
  groupingReturnInputs,
} from "./return-staging-test-support";
import { loadCompleteReturnWork } from "../../../shared/accounts/load-return-work";
import type {
  AccountReturnSummaries,
  AccountReturnProgress,
} from "../../../shared/accounts/account-returns";
import { toMoney } from "../../../shared/money";
import { HistoryPending } from "../../valuation/history/types";
const mocks = vi.hoisted(() => ({
  inputs: vi.fn(),
  revision: vi.fn(),
  redis: vi.fn(),
  cutoff: vi.fn(),
  cache: vi.fn(),
  history: vi.fn(),
  lookup: vi.fn(),
  pump: vi.fn(),
}));
vi.mock("./return-inputs.server", () => ({
  loadAccountReturnInputs: mocks.inputs,
}));
vi.mock("../../../redis.server", () => ({ getRedisClient: mocks.redis }));
vi.mock("../../period/cache/period-cache.server", () => ({
  getPeriodCacheGeneration: mocks.revision,
  getPeriodCacheEnvOrThrowWhenRedisAvailable: () => "test",
}));
vi.mock("../../valuation/lookup-context", () => ({
  createValuationLookupContext: () => ({ latestFetchableDate: mocks.cutoff() }),
}));
vi.mock("../../valuation/history/loader.server", () => ({
  createHistoricalLoader: mocks.history,
}));
vi.mock("./return-cache.server", async (original) => ({
  ...(await original<typeof import("./return-cache.server")>()),
  getOrLoadAccountReturnSummaries: mocks.cache,
}));
import {
  queryAccountReturnWork,
  type ReturnWorkArgs,
} from "./account-returns.server";
let index = 0;
const scope = {
  accountBookId: "book",
  accountState: "all" as const,
  grouping: "accountStructure" as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T12:00Z"));
  scope.accountBookId = `work-book-${++index}`;
  mocks.redis.mockResolvedValue(null);
  mocks.revision.mockResolvedValue("revision");
  mocks.cutoff.mockReturnValue(new Date("2026-11-06Z"));
  mocks.inputs.mockImplementation(
    async (_book: string, date: Date, id?: string) =>
      stagingReturnInputs(date, id),
  );
  mocks.lookup.mockImplementation(async (input) => ({
    rate: stagingReturnRate(input),
    source: "timeSeries",
    validUntil: Infinity,
  }));
  mocks.pump.mockResolvedValue(4);
  mocks.history.mockImplementation(async () => ({
    lookup: mocks.lookup,
    pump: mocks.pump,
    pending: () => 0,
  }));
  mocks.cache.mockImplementation(async (_scope, load) => (await load()).data);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const summary = (data: Awaited<ReturnType<typeof queryAccountReturnWork>>) => {
  if (data.status !== "complete" || !("rows" in data.data))
    throw new Error("Expected summary");
  return data.data;
};
async function complete(
  args: ReturnWorkArgs,
  progress: AccountReturnProgress[] = [],
) {
  const data = await loadCompleteReturnWork(
    (continuation, batchSize) =>
      queryAccountReturnWork({ ...args, continuation, batchSize }, "user"),
    undefined,
    (p) => {
      if (p) progress.push(p);
    },
  );
  return data;
}
it("finishes the full staging fixture, publishes cheap rows first, and computes distinct memberships only once", async () => {
  const progress: AccountReturnProgress[] = [];
  const first = await queryAccountReturnWork(scope, "user");
  expect(first.status).toBe("pending");
  if (first.status !== "pending") throw new Error("Expected pending");
  expect(
    first.progress?.rows.some(
      (r) => r.id === "managed-portfolio" && r.mwr !== null,
    ),
  ).toBe(true);
  const structure = await complete(scope, progress);
  if (!("rows" in structure)) throw new Error("Expected summary");
  expect(
    structure.rows.find((r) => r.id === "managed-portfolio")?.mwr,
  ).toBeCloseTo(0.15298365839474282, 10);
  expect(structure.total.twr).toBeCloseTo(0.004536284711657982, 10);
  expect(
    progress.every((p, i) => !i || p.completed >= progress[i - 1]!.completed),
  ).toBe(true);
  expect(mocks.inputs).toHaveBeenCalledTimes(1);
  const classified = await complete({ ...scope, grouping: "assetClass" });
  if (!("rows" in classified)) throw new Error("Expected summary");
  expect(classified.total).toEqual(structure.total);
  expect(
    classified.rows.some((r) => r.id.startsWith("__asset_class_archived__")),
  ).toBe(true);
}, 30_000);
it("publishes available rows while providers are pending and preserves them across resumptions", async () => {
  let blocked = true;
  mocks.lookup.mockImplementation(async (input) => {
    if (blocked && input.currency !== "CHF") throw new HistoryPending();
    return {
      rate: stagingReturnRate(input),
      source: "timeSeries",
      validUntil: Infinity,
    };
  });
  mocks.pump.mockImplementation(async () => {
    blocked = false;
    return 4;
  });
  const first = await queryAccountReturnWork(scope, "user");
  if (first.status !== "pending") throw new Error("Expected pending");
  expect(
    first.progress?.rows.find((r) => r.id === "managed-portfolio")?.twr,
  ).not.toBeNull();
  const values = await complete(scope);
  expect(
    "rows" in values && values.rows.find((r) => r.id === "aapl")?.mwr,
  ).not.toBeNull();
  expect(mocks.pump).toHaveBeenCalled();
}, 30_000);
it("reuses a completed work index and cached ledger/account calculations without reloading transactions", async () => {
  const args = {
    ...scope,
    target: { kind: "account" as const, id: "managed-portfolio" },
    period: "2026-06",
    includeDetails: true,
  };
  const first = await complete(args);
  expect(first).toMatchObject({ asOfDate: "2026-06-30" });
  expect("valuations" in first && first.valuations.length).toBeGreaterThan(1);
  const calls = mocks.inputs.mock.calls.length;
  mocks.lookup.mockClear();
  const second = await queryAccountReturnWork(args, "user");
  expect(second).toMatchObject({ status: "complete", data: first });
  expect(mocks.lookup).not.toHaveBeenCalled();
  expect(mocks.inputs).toHaveBeenCalledTimes(calls);
});
it("restarts unknown, mismatched-user, scope, revision and publication continuations", async () => {
  const first = await queryAccountReturnWork(scope, "user");
  if (first.status !== "pending") throw new Error("Expected pending");
  const args = { ...scope, continuation: first.continuation };
  expect(await queryAccountReturnWork(args, "other")).toEqual({
    status: "restart",
  });
  expect(
    await queryAccountReturnWork({ ...args, grouping: "assetClass" }, "user"),
  ).toEqual({ status: "restart" });
  mocks.revision.mockResolvedValue("changed");
  expect(await queryAccountReturnWork(args, "user")).toEqual({
    status: "restart",
  });
  mocks.revision.mockResolvedValue("revision");
  mocks.cutoff.mockReturnValue(new Date("2026-11-07Z"));
  expect(await queryAccountReturnWork(args, "user")).toEqual({
    status: "restart",
  });
});
it("bounds temporary summary validity by the earliest dependency expiry", async () => {
  const snapshot = groupingReturnInputs();
  mocks.inputs.mockResolvedValue(snapshot);
  const expiry = Date.now() + 120_000;
  mocks.lookup.mockResolvedValue({
    rate: toMoney(1),
    source: "covered",
    validUntil: expiry,
  });
  await complete(scope);
  const saved = await mocks.cache.mock.calls.at(-1)![1]();
  expect(saved.cacheable).toBe(true);
  expect(saved.expiresAt).toBe(expiry);
  vi.setSystemTime(expiry + 1);
  await queryAccountReturnWork(scope, "user");
  expect(mocks.history.mock.calls.length).toBeGreaterThan(1);
});
it("rejects stale revisions discovered after a batch, before publishing its results", async () => {
  mocks.revision.mockResolvedValueOnce("revision").mockResolvedValue("changed");
  expect(await queryAccountReturnWork(scope, "user")).toEqual({
    status: "restart",
  });
});
it("matches leaf G/L eligibility and includes idle cash plus archived holdings in group capital", async () => {
  mocks.inputs.mockResolvedValue(groupingReturnInputs());
  mocks.lookup.mockImplementation(async ({ currency, date }) => ({
    rate: toMoney(
      currency === "CHF" || date.toISOString().startsWith("2025") ? 1 : 1.2,
    ),
    source: "timeSeries",
    validUntil: Infinity,
  }));
  const data = (await complete(scope)) as AccountReturnSummaries;
  expect(data.rows.find((r) => r.id === "cash")?.applicable).toBe(false);
  expect(data.rows.find((r) => r.id === "archived")?.applicable).toBe(true);
  expect(data.total.twr).toBeCloseTo(0.1, 12);
  const active = (await complete({
    ...scope,
    accountState: "active",
  })) as AccountReturnSummaries;
  expect(active.rows.some((r) => r.id === "archived")).toBe(false);
});
it("takes a warm summary-cache hit without reading history or transaction data", async () => {
  mocks.inputs.mockResolvedValue(groupingReturnInputs());
  const cached = await complete(scope);
  mocks.cache.mockResolvedValue(cached);
  mocks.inputs.mockClear();
  mocks.history.mockClear();
  expect(summary(await queryAccountReturnWork(scope, "user"))).toEqual(cached);
  expect(mocks.inputs).not.toHaveBeenCalled();
  expect(mocks.history).not.toHaveBeenCalled();
});
it("publishes recovered completed rows before waiting on a failed provider again", async () => {
  mocks.lookup.mockImplementation(async (input) => {
    if (input.currency !== "CHF") throw new HistoryPending();
    return {
      rate: stagingReturnRate(input),
      source: "timeSeries",
      validUntil: Infinity,
    };
  });
  mocks.pump.mockRejectedValue(new Error("Provider unavailable"));
  let continuation: string | undefined;
  let failed = false;
  for (let i = 0; i < 20; i++) {
    try {
      const next = await queryAccountReturnWork(
        { ...scope, continuation },
        "user",
      );
      if (next.status !== "pending") throw new Error("Expected pending");
      continuation = next.continuation;
    } catch (error) {
      expect(error).toMatchObject({ message: "Provider unavailable" });
      failed = true;
      break;
    }
  }
  expect(failed).toBe(true);
  mocks.pump.mockClear();
  const recovered = await queryAccountReturnWork(scope, "user");
  expect(recovered.status).toBe("pending");
  if (recovered.status !== "pending")
    throw new Error("Expected recovered progress");
  expect(
    recovered.progress?.rows.find((row) => row.id === "managed-portfolio")?.twr,
  ).not.toBeNull();
  expect(mocks.pump).not.toHaveBeenCalled();
}, 30_000);
