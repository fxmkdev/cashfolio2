import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  stagingReturnInputs,
  stagingReturnRate,
} from "./return-staging-test-support";
import { toMoney } from "../../../shared/money";
import { loadCompleteReturnWork } from "../../../shared/load-return-work";
import type {
  AccountReturnDetails,
  AccountReturnSummaries,
} from "../../../shared/account-returns";
import { ResourceLimitError } from "../../resource-error";
import type { ReturnRateInput } from "./return-engine";
const mocks = vi.hoisted(() => ({
  inputs: vi.fn(),
  revision: vi.fn(),
  rate: vi.fn(),
  redis: vi.fn(),
  cutoff: vi.fn(),
  cache: vi.fn(),
}));
vi.mock("./return-inputs.server", () => ({
  loadAccountReturnInputs: mocks.inputs,
}));
vi.mock("../../../redis.server", () => ({ getRedisClient: mocks.redis }));
vi.mock("../../period/cache/period-cache", () => ({
  getPeriodCacheGeneration: mocks.revision,
  getPeriodCacheEnvOrThrowWhenRedisAvailable: () => "test",
}));
vi.mock("../../period/period-conversion", () => ({
  getUnitToReferenceExchangeRateDetails: mocks.rate,
}));
vi.mock("../../valuation/lookup-context", () => ({
  createValuationLookupContext: () => ({ latestFetchableDate: mocks.cutoff() }),
}));
vi.mock("./return-cache.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./return-cache.server")>()),
  getOrLoadAccountReturnSummaries: mocks.cache,
}));
import {
  queryAccountReturnWork,
  type ReturnWorkArgs,
} from "./account-returns.server";
const scope = {
  accountBookId: "book",
  accountState: "all" as const,
  grouping: "accountStructure" as const,
};
let maxConcurrent = 0;
let active = 0;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
  mocks.inputs.mockImplementation(
    async (_book: string, date: Date, id?: string) =>
      stagingReturnInputs(date, id),
  );
  mocks.revision.mockResolvedValue("revision");
  mocks.redis.mockResolvedValue(null);
  mocks.cutoff.mockReturnValue(new Date("2026-11-06Z"));
  mocks.cache.mockImplementation(async (_scope, load) => (await load()).data);
  maxConcurrent = active = 0;
  mocks.rate.mockImplementation(
    async (
      input: ReturnRateInput & {
        scheduleLookup: (f: () => Promise<unknown>) => Promise<unknown>;
      },
    ) =>
      input.scheduleLookup(async () => {
        active++;
        maxConcurrent = Math.max(active, maxConcurrent);
        await Promise.resolve();
        active--;
        return { rate: stagingReturnRate(input), source: "timeSeries" };
      }),
  );
});
afterEach(() => vi.useRealTimers());

async function complete(args: ReturnWorkArgs) {
  let batches = 0;
  const data = await loadCompleteReturnWork(async (continuation, batchSize) => {
    const before = mocks.rate.mock.calls.length;
    const result = await queryAccountReturnWork(
      { ...args, continuation, batchSize },
      "user",
    );
    expect(mocks.rate.mock.calls.length - before).toBeLessThanOrEqual(
      batchSize,
    );
    if (result.status === "pending") batches++;
    return result;
  });
  return { data, batches };
}
function summary(
  data: AccountReturnDetails | AccountReturnSummaries,
): AccountReturnSummaries {
  if (!("rows" in data)) throw new Error("Expected summary");
  return data;
}

describe("resumable staging return calculations", () => {
  it("completes the three-year staging book in bounded batches without Redis and preserves grouping-invariant totals", async () => {
    const structure = await complete(scope);
    const data = summary(structure.data);
    expect(structure.batches).toBeGreaterThan(10);
    expect(maxConcurrent).toBe(4);
    expect(
      data.rows.find((r) => r.id === "managed-portfolio")?.mwr,
    ).toBeCloseTo(0.15298365839474282, 10);
    expect(data.rows.find((r) => r.id === "aapl")?.mwr).not.toBeNull();
    expect(data.rows.find((r) => r.id === "usd")?.mwr).not.toBeNull();
    expect(data.total.twr).toBeCloseTo(0.004536284711657982, 10);
    expect(data.total.mwr).not.toBeNull();
    expect(data.rows.some((r) => r.id.startsWith("__archived__"))).toBe(true);
    const classified = summary(
      (await complete({ ...scope, grouping: "assetClass" })).data,
    );
    expect(classified.total).toEqual(data.total);
    expect(
      classified.rows.some((r) => r.id.startsWith("__asset_class_unit__:")),
    ).toBe(true);
    expect(
      data.rows
        .flatMap((r) => r.diagnostics)
        .some((d) => d.message.includes("complex")),
    ).toBe(false);
  }, 30_000);
  it("shares the pipeline for ledger periods and detailed calculations, with account-scoped inputs", async () => {
    const args = {
      ...scope,
      target: { kind: "account" as const, id: "managed-portfolio" },
      period: "2026-06",
      includeDetails: true,
    };
    const result = (await complete(args)).data;
    expect(mocks.inputs).toHaveBeenLastCalledWith(
      "book",
      new Date("2026-06-30Z"),
      "managed-portfolio",
    );
    if ("rows" in result) throw new Error("Expected detail");
    expect(result.asOfDate).toBe("2026-06-30");
    expect("valuations" in result && result.valuations.length).toBeGreaterThan(
      1,
    );
    expect(result.mwr).not.toBeNull();
    const compact = (await complete({ ...args, includeDetails: false })).data;
    expect(compact).toMatchObject({
      twr: result.twr,
      mwr: result.mwr,
      valuations: [],
      cashFlows: [],
    });
  });
  it("restarts changed revisions, publication cutoffs, dates, scopes, users, and missing continuations", async () => {
    const start = await queryAccountReturnWork(scope, "user");
    if (start.status !== "pending") throw new Error("Expected pending");
    const args = { ...scope, continuation: start.continuation };
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
    const next = await queryAccountReturnWork(scope, "user");
    if (next.status !== "pending") throw new Error("Expected pending");
    mocks.cutoff.mockReturnValue(new Date("2026-11-07Z"));
    expect(
      await queryAccountReturnWork(
        { ...scope, continuation: next.continuation },
        "user",
      ),
    ).toEqual({ status: "restart" });
    expect(
      await queryAccountReturnWork(
        { ...scope, continuation: "unknown" },
        "user",
      ),
    ).toEqual({ status: "restart" });
  });
  it("retains successful sibling valuations after a failure and retries only unfinished work", async () => {
    const start = await queryAccountReturnWork(scope, "user");
    if (start.status !== "pending") throw new Error("Expected pending");
    mocks.rate.mockRejectedValueOnce(
      new ResourceLimitError("Timed out", 503, 0, "read_deadline"),
    );
    await expect(
      queryAccountReturnWork(
        { ...scope, continuation: start.continuation, batchSize: 4 },
        "user",
      ),
    ).rejects.toThrow("Timed out");
    expect(mocks.rate).toHaveBeenCalledTimes(4);
    await queryAccountReturnWork(
      { ...scope, continuation: start.continuation, batchSize: 4 },
      "user",
    );
    expect(mocks.rate).toHaveBeenCalledTimes(5);
  });
  it("persists only stable completed summaries, and takes warm hits without recalculation", async () => {
    const snapshot = stagingReturnInputs();
    snapshot.accounts = snapshot.accounts.filter((a) => a.id === "eur");
    snapshot.transactions = [];
    snapshot.groups = [];
    snapshot.classes = [];
    mocks.inputs.mockResolvedValue(snapshot);
    for (const source of ["provider", "fallback", "missing", "timeSeries"]) {
      mocks.rate.mockResolvedValue({
        rate: source === "missing" ? null : toMoney(1),
        source,
      });
      await complete(scope);
      const loaded = await mocks.cache.mock.calls.at(-1)![1]();
      expect(loaded.cacheable).toBe(source === "timeSeries");
    }
    const cached = summary((await complete(scope)).data);
    mocks.cache.mockResolvedValue(cached);
    mocks.inputs.mockClear();
    mocks.rate.mockClear();
    expect(await queryAccountReturnWork(scope, "user")).toEqual({
      status: "complete",
      data: cached,
    });
    expect(mocks.inputs).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
  });
  it("expires checkpoints and restarts at a changed reporting day", async () => {
    const start = await queryAccountReturnWork(scope, "user");
    if (start.status !== "pending") throw new Error("Expected pending");
    vi.setSystemTime(new Date("2026-11-07T12:16:00Z"));
    expect(
      await queryAccountReturnWork(
        { ...scope, continuation: start.continuation },
        "user",
      ),
    ).toEqual({ status: "restart" });
    const next = await queryAccountReturnWork(scope, "user");
    if (next.status !== "pending") throw new Error("Expected pending");
    vi.setSystemTime(new Date("2026-11-08T00:00:00Z"));
    expect(
      await queryAccountReturnWork(
        { ...scope, continuation: next.continuation },
        "user",
      ),
    ).toEqual({ status: "restart" });
  });
});

it("deduplicates dependencies and completes idempotently when a final response is retried", async () => {
  const snapshot = stagingReturnInputs(new Date("2026-11-07Z"), "eur");
  mocks.inputs.mockResolvedValue(snapshot);
  const args = {
    ...scope,
    target: { kind: "account" as const, id: "eur" },
    includeDetails: true,
  };
  let cursor: string | undefined;
  const data = await loadCompleteReturnWork(async (continuation, batchSize) => {
    const response = await queryAccountReturnWork(
      { ...args, continuation, batchSize },
      "user",
    );
    if (response.status === "pending") cursor = response.continuation;
    return response;
  });
  const keys = mocks.rate.mock.calls.map(([input]) =>
    JSON.stringify([
      input.unit,
      input.currency,
      input.cryptocurrency,
      input.symbol,
      input.tradeCurrency,
      input.date,
    ]),
  );
  expect(new Set(keys).size).toBe(keys.length);
  mocks.rate.mockClear();
  expect(
    await queryAccountReturnWork({ ...args, continuation: cursor }, "user"),
  ).toEqual({ status: "complete", data });
  expect(mocks.rate).not.toHaveBeenCalled();
});
it("can verify fresh snapshots when the standalone revision lookup is unavailable", async () => {
  mocks.revision.mockResolvedValue(null);
  const result = await complete({
    ...scope,
    target: { kind: "account", id: "eur" },
  });
  expect(result.data).toMatchObject({ applicable: true, twr: 0 });
});

it("matches G/L eligibility while including idle cash and archived descendants in group capital", async () => {
  const { groupingReturnInputs } =
    await import("./return-staging-test-support");
  mocks.inputs.mockResolvedValue(groupingReturnInputs());
  mocks.rate.mockImplementation(async ({ date }) => ({
    rate: toMoney(date.toISOString().startsWith("2025") ? 1 : 1.2),
    source: "timeSeries",
  }));
  const data = summary((await complete(scope)).data);
  expect(data.rows.find((r) => r.id === "cash")?.applicable).toBe(false);
  expect(data.rows.find((r) => r.id === "archived")?.applicable).toBe(true);
  expect(data.rows.find((r) => r.id === "a")?.twr).toBeCloseTo(0.2, 12);
  expect(data.total.twr).toBeCloseTo(0.1, 12);
  expect(data.rows.find((r) => r.id === "group")?.twr).toBeCloseTo(
    data.total.twr!,
    12,
  );
  expect(
    data.rows.find((r) => r.id === "__archived__:group:group")?.twr,
  ).toBeCloseTo(0.1, 12);
  const active = summary(
    (await complete({ ...scope, accountState: "active" })).data,
  );
  expect(active.rows.some((r) => r.id === "archived")).toBe(false);
  expect(active.total.twr).toBeCloseTo(0.1, 12);
  await expect(
    queryAccountReturnWork(
      { ...scope, target: { kind: "account", id: "missing" } },
      "user",
    ),
  ).rejects.toThrow("not found");
  await expect(
    queryAccountReturnWork(
      { ...scope, target: { kind: "group", id: "missing" } },
      "user",
    ),
  ).rejects.toThrow("not found");
});
