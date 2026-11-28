import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toMoney } from "../../../shared/money";
import { ResourceLimitError } from "../../resource-error";
import { groupingReturnInputs } from "./return-staging-test-support";
import * as workStores from "./return-work-store.server";
import { createReturnWorkContext } from "./return-work-context.server";
import { returnArtifactId } from "./return-artifacts.server";
const mocks = vi.hoisted(() => ({ revision: vi.fn(), history: vi.fn() }));
vi.mock("../../../redis.server", () => ({ getRedisClient: async () => null }));
vi.mock("../../period/cache/period-cache.server", () => ({
  getPeriodCacheGeneration: mocks.revision,
  getPeriodCacheEnvOrThrowWhenRedisAvailable: () => "test",
}));
vi.mock("../../valuation/lookup-context", async (original) => ({
  ...(await original<typeof import("../../valuation/lookup-context")>()),
  createValuationLookupContext: () => ({
    latestFetchableDate: new Date("2026-11-06Z"),
  }),
}));
vi.mock("./return-inputs.server", () => ({
  loadAccountReturnInputs: async () => groupingReturnInputs(),
}));
vi.mock("./return-cache.server", async (original) => ({
  ...(await original<typeof import("./return-cache.server")>()),
  getCachedAccountReturnSummaries: async () => undefined,
  getOrLoadAccountReturnSummaries: async (
    _args: unknown,
    load: () => Promise<{ data: unknown }>,
  ) => (await load()).data,
}));
vi.mock("../../valuation/history/loader.server", () => ({
  createHistoricalLoader: mocks.history,
}));
import { queryAccountReturnWork } from "./account-returns.server";
let serial = 0;
const args = {
  accountBookId: "lifecycle",
  accountState: "all" as const,
  grouping: "accountStructure" as const,
  target: { kind: "account" as const, id: "archived" },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T12:00Z"));
  args.accountBookId = `lifecycle-${++serial}`;
  mocks.revision.mockResolvedValue("revision");
  mocks.history.mockResolvedValue({
    lookup: async () => ({
      rate: toMoney(1),
      source: "timeSeries",
      validUntil: Infinity,
    }),
    pending: () => 0,
    pump: vi.fn(),
  });
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function interceptedStore() {
  const store = await workStores.returnWorkStore(args.accountBookId, "user");
  vi.spyOn(workStores, "returnWorkStore").mockResolvedValue(store);
  return store;
}
it("resumes an existing v6 checkpoint with the original binding and context hash", async () => {
  const store = await interceptedStore();
  const binding = JSON.stringify([
    "user",
    args.accountBookId,
    "all",
    "accountStructure",
    args.target,
    null,
    false,
  ]);
  const context = returnArtifactId([
    "money-weighted-v6",
    "plan-v4",
    binding,
    "revision",
    "2026-11-07",
    "2026-11-06",
  ]);
  await store.save("existing-v6", {
    binding,
    context,
    revision: "revision",
    asOfDate: "2026-11-07",
    publication: "2026-11-06",
    planId: "old-plan",
    createdAt: Date.now(),
    sequence: 3,
    done: [],
    failures: {},
    phase: "history",
    validUntil: Date.now() + 900_000,
  });
  expect(
    await queryAccountReturnWork(
      { ...args, continuation: "existing-v6" },
      "user",
    ),
  ).toMatchObject({ status: "complete", progress: { context, sequence: 5 } });
});
it("returns pending progress without advancing work while the lease is held elsewhere", async () => {
  const store = await interceptedStore();
  vi.spyOn(store, "lease").mockResolvedValue(undefined);
  const save = vi.spyOn(store, "save");
  const response = await queryAccountReturnWork(args, "user");
  expect(response).toMatchObject({
    status: "pending",
    retryAfterMs: 200,
    progress: { sequence: 0, completed: 0 },
  });
  expect(save).not.toHaveBeenCalled();
  expect(mocks.history).not.toHaveBeenCalled();
});
it("rereads the checkpoint after obtaining the lease instead of overwriting another tab's sequence", async () => {
  const store = await interceptedStore();
  const release = vi.fn();
  vi.spyOn(store, "lease").mockImplementation(async (id) => {
    const identity = await createReturnWorkContext(args, "user");
    await store.save(id, {
      ...identity,
      planId: "existing",
      createdAt: Date.now(),
      validUntil: Date.now() + 900_000,
      sequence: 7,
      phase: "history",
      done: [],
      failures: {},
    });
    return release;
  });
  const response = await queryAccountReturnWork(args, "user");
  expect(response).toMatchObject({
    status: "complete",
    progress: { sequence: 9 },
  });
  expect(release).toHaveBeenCalledOnce();
});
it.each(["success", "restart", "error"] as const)(
  "releases the lease after %s and invalidates only failed or stale work",
  async (outcome) => {
    const store = await interceptedStore();
    const release = vi.fn();
    vi.spyOn(store, "lease").mockResolvedValue(release);
    const invalidate = vi.spyOn(store, "invalidate");
    const cancelled = new ResourceLimitError("Cancelled", 503, 0, "cancelled");
    if (outcome === "restart")
      mocks.revision
        .mockResolvedValueOnce("revision")
        .mockResolvedValue("changed");
    if (outcome === "error") mocks.history.mockRejectedValue(cancelled);
    const response = queryAccountReturnWork(args, "user");
    if (outcome === "error") await expect(response).rejects.toBe(cancelled);
    else
      await expect(response).resolves.toMatchObject({
        status: outcome === "success" ? "complete" : "restart",
      });
    expect(release).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledTimes(outcome === "success" ? 0 : 1);
  },
);
