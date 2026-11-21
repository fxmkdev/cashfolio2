import { afterEach, beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  redis: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  budget: vi.fn(),
}));
vi.mock("../../redis.server", () => ({ getRedisClient: mocks.redis }));
vi.mock("../resource-context.server", () => ({
  startReadBudget: vi.fn(),
  checkResourceBudget: mocks.budget,
  createUserScopedSharedWork: () => (_key: string, work: () => unknown) =>
    work(),
}));
vi.mock("./marketstack.server", async (original) => ({
  ...(await original<typeof import("./marketstack.server")>()),
  fetchMarketstackTicker: mocks.fetch,
}));
import { Temporal } from "../../shared/temporal";
import { issueListing } from "./selection.server";
import { securityMetadata } from "./metadata.server";
const listing = {
  symbol: "NEE 6.219",
  mic: "NMFQS",
  name: "Example",
  exchange: "Fund Exchange",
  country: null,
  hasHistory: false,
};
const metadata = {
  symbol: listing.symbol,
  mic: listing.mic,
  isin: "US0000000000",
};
const input = (change = {}) => ({
  selectionToken: issueListing({ ...listing, ...change }).selectionToken,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SESSION_SECRET", "test-only-key");
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Unexpected network request"),
  );
  vi.spyOn(Temporal.Now, "instant").mockReturnValue(
    Temporal.Instant.from("2026-11-21T12:00:00Z"),
  );
  mocks.redis.mockResolvedValue({ get: mocks.get, set: mocks.set });
  mocks.get.mockResolvedValue(null);
  mocks.fetch.mockResolvedValue(metadata);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
test("resolves exact signed identity even without price history and caches metadata for seven days", async () => {
  const selected = input();
  const result = await securityMetadata(selected);
  expect(result).toMatchObject({
    isin: metadata.isin,
    listingId: expect.any(String),
  });
  expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith("NEE 6.219", "NMFQS");
  expect(mocks.set).toHaveBeenCalledWith(
    expect.stringContaining("securities:marketstack:metadata:v1:"),
    JSON.stringify(metadata),
    { EX: 604800 },
  );
  mocks.get.mockResolvedValue(mocks.set.mock.calls[0]![1]);
  mocks.fetch.mockClear();
  expect(await securityMetadata(input())).toEqual(result);
  expect(mocks.fetch).not.toHaveBeenCalled();
});
test("caches validated missing ISINs for seven days without repeated provider calls", async () => {
  mocks.fetch.mockResolvedValue({ ...metadata, isin: null });
  const first = await securityMetadata(input());
  expect(first.isin).toBeNull();
  expect(mocks.set.mock.calls[0]![2]).toEqual({ EX: 604800 });
  mocks.get.mockResolvedValue(mocks.set.mock.calls[0]![1]);
  mocks.fetch.mockClear();
  expect(await securityMetadata(input())).toEqual(first);
  expect(mocks.fetch).not.toHaveBeenCalled();
});
test("cache keys isolate exact symbols and exchanges, not expiring selection tokens", async () => {
  await securityMetadata(input());
  const first = mocks.get.mock.calls[0]![0];
  mocks.fetch.mockResolvedValue({ ...metadata, mic: "XETRA" });
  await securityMetadata(input({ mic: "XETRA" }));
  expect(mocks.get.mock.calls[1]![0]).not.toBe(first);
  mocks.fetch.mockResolvedValue({ ...metadata, symbol: "NEE6.219" });
  await securityMetadata(input({ symbol: "NEE6.219" }));
  expect(mocks.get.mock.calls[2]![0]).not.toBe(first);
  expect(new Set(mocks.get.mock.calls.map(([key]) => key)).size).toBe(3);
});
test("revalidates corrupt, missing-field, wrong-identity and malformed cached metadata", async () => {
  for (const cached of [
    "{",
    "null",
    JSON.stringify({ ...metadata, isin: 12 }),
    JSON.stringify({ ...metadata, isin: "bad" }),
    JSON.stringify({ ...metadata, symbol: "OTHER" }),
    JSON.stringify({ ...metadata, mic: "XNAS" }),
    JSON.stringify({ symbol: listing.symbol, mic: listing.mic }),
  ]) {
    mocks.get.mockResolvedValueOnce(cached);
    expect((await securityMetadata(input())).isin).toBe(metadata.isin);
  }
  expect(mocks.fetch).toHaveBeenCalledTimes(7);
});
test("Redis outages and failed writes do not block validated metadata", async () => {
  mocks.redis.mockRejectedValueOnce(new Error("offline"));
  expect((await securityMetadata(input())).isin).toBe(metadata.isin);
  mocks.set.mockRejectedValueOnce(new Error("offline"));
  expect((await securityMetadata(input())).isin).toBe(metadata.isin);
});
test("invalid, tampered and expired references cannot reach the cache or provider", async () => {
  const selected = input();
  await expect(
    securityMetadata({ selectionToken: selected.selectionToken + "tampered" }),
  ).rejects.toThrow("Search again");
  vi.spyOn(Temporal.Now, "instant").mockReturnValue(
    Temporal.Instant.from("2026-11-22T12:00:00Z"),
  );
  await expect(securityMetadata(selected)).rejects.toThrow("expired");
  expect(mocks.redis).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
test("a listing without a MIC remains Unknown without cache or provider work", async () => {
  expect((await securityMetadata(input({ mic: null }))).isin).toBeNull();
  expect(mocks.redis).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
test.each([
  "different listing",
  "invalid ISIN",
  "quota",
  "credentials",
  "cancelled",
  "temporarily unavailable",
])("does not cache %s failures as missing ISIN", async (message) => {
  mocks.fetch.mockRejectedValueOnce(new Error(message));
  await expect(securityMetadata(input())).rejects.toThrow(message);
  expect(mocks.set).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
