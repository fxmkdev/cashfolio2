import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyAccountReturnResult,
  type AccountReturnSummaries,
} from "../../../shared/account-returns";

const mocks = vi.hoisted(() => ({
  redis: vi.fn(),
  revision: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  cutoff: vi.fn(),
}));
vi.mock("../../../redis.server", () => ({ getRedisClient: mocks.redis }));
vi.mock("../../period/cache/period-cache", () => ({
  PERIOD_CACHE_TTL_SECONDS: 86400,
  getPeriodCacheEnvOrThrowWhenRedisAvailable: () => "test",
  getPeriodCacheGeneration: mocks.revision,
  formatUtcDateKey: (date: Date) => date.toISOString().slice(0, 10),
}));
vi.mock("../../valuation/lookup-context", () => ({
  createValuationLookupContext: () => ({ latestFetchableDate: mocks.cutoff() }),
}));
import {
  getOrLoadAccountReturnSummaries,
  isAccountReturnSummaries,
} from "./return-cache.server";
import { ResourceLimitError } from "../../resource-error";

const scope = {
  accountBookId: "book",
  grouping: "accountStructure" as const,
  accountState: "all" as const,
};
const key =
  "account:returns:v1:test:book:revision:2026-05-11:2026-05-10:accountStructure:all";
function data(): AccountReturnSummaries {
  return {
    referenceCurrency: "CHF",
    startDate: "2026-01-01",
    asOfDate: "2026-05-11",
    rows: [{ id: "a", ...emptyAccountReturnResult() }],
    total: emptyAccountReturnResult(),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-11T14:00:00Z"));
  mocks.redis.mockResolvedValue({ get: mocks.get, setEx: mocks.set });
  mocks.revision.mockResolvedValue("revision");
  mocks.cutoff.mockReturnValue(new Date("2026-05-10T00:00:00Z"));
  mocks.get.mockResolvedValue(null);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const load = () =>
  vi
    .fn()
    .mockResolvedValue({ data: data(), revision: "revision", cacheable: true });
describe("account return cache", () => {
  it("coalesces overlapping loads of the same summary scope", async () => {
    const calculate = load();
    await Promise.all([
      getOrLoadAccountReturnSummaries(scope, calculate),
      getOrLoadAccountReturnSummaries(scope, calculate),
    ]);
    expect(calculate).toHaveBeenCalledOnce();
  });
  it("propagates workload failures instead of retrying uncached or persisting partial work", async () => {
    const error = new ResourceLimitError(
      "Budget exhausted",
      429,
      1,
      "provider_request_limit",
    );
    mocks.get.mockRejectedValue(error);
    const calculate = load();
    await expect(
      getOrLoadAccountReturnSummaries(scope, calculate),
    ).rejects.toBe(error);
    expect(calculate).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("validates warm hits without invoking the calculator", async () => {
    mocks.get.mockResolvedValue(JSON.stringify(data()));
    const calculate = load();
    expect(await getOrLoadAccountReturnSummaries(scope, calculate)).toEqual(
      data(),
    );
    expect(calculate).not.toHaveBeenCalled();
    expect(mocks.get).toHaveBeenCalledWith(key);
  });
  it("persists only complete stable-valuation results with a committed matching revision", async () => {
    await getOrLoadAccountReturnSummaries(scope, load());
    expect(mocks.set).toHaveBeenCalledWith(key, 86400, JSON.stringify(data()));
    mocks.set.mockClear();
    await getOrLoadAccountReturnSummaries(
      scope,
      vi.fn().mockResolvedValue({
        data: data(),
        revision: "revision",
        cacheable: false,
      }),
    );
    expect(mocks.set).not.toHaveBeenCalled();
    mocks.revision
      .mockResolvedValueOnce("revision")
      .mockResolvedValueOnce("new-revision");
    await getOrLoadAccountReturnSummaries(scope, load());
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("separates grouping, account state, and generation keys", async () => {
    await getOrLoadAccountReturnSummaries(
      { ...scope, grouping: "assetClass", accountState: "inactive" },
      load(),
    );
    expect(mocks.get).toHaveBeenCalledWith(
      key.replace("accountStructure:all", "assetClass:inactive"),
    );
    mocks.revision.mockResolvedValue("new");
    await getOrLoadAccountReturnSummaries(scope, load());
    expect(mocks.get).toHaveBeenCalledWith(key.replace(":revision:", ":new:"));
  });
  it("does not persist across the publication cutoff or UTC rollover", async () => {
    mocks.cutoff
      .mockReturnValueOnce(new Date("2026-05-10T00:00:00Z"))
      .mockReturnValue(new Date("2026-05-11T00:00:00Z"));
    await getOrLoadAccountReturnSummaries(scope, load());
    expect(mocks.set).not.toHaveBeenCalled();
    vi.setSystemTime(new Date("2026-05-12T00:00:00Z"));
    await getOrLoadAccountReturnSummaries(scope, load());
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("falls back on malformed, oversized, or failed cache reads and unavailable Redis", async () => {
    for (const cached of [
      "{",
      JSON.stringify({ ...data(), total: { twr: 1 } }),
      "x".repeat(512 * 1024 + 1),
    ]) {
      mocks.get.mockResolvedValue(cached);
      const calculate = load();
      expect(await getOrLoadAccountReturnSummaries(scope, calculate)).toEqual(
        data(),
      );
      expect(calculate).toHaveBeenCalledOnce();
    }
    mocks.get.mockRejectedValue(new Error("offline"));
    mocks.set.mockRejectedValue(new Error("offline"));
    expect(await getOrLoadAccountReturnSummaries(scope, load())).toEqual(
      data(),
    );
    mocks.redis.mockResolvedValue(null);
    expect(await getOrLoadAccountReturnSummaries(scope, load())).toEqual(
      data(),
    );
  });
  it("rejects nonfinite rates and malformed diagnostic/effective date data", () => {
    expect(isAccountReturnSummaries(data())).toBe(true);
    expect(
      isAccountReturnSummaries({
        ...data(),
        total: { ...data().total, twr: Infinity },
      }),
    ).toBe(false);
    expect(
      isAccountReturnSummaries({
        ...data(),
        total: {
          ...data().total,
          diagnostics: [{ metric: "wrong", message: "x" }],
        },
      }),
    ).toBe(false);
  });
});
