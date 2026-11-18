import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  redis: vi.fn(),
  resolve: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock("../../redis.server", () => ({ getRedisClient: mocks.redis }));
vi.mock("./selection.server", () => ({ resolveListing: mocks.resolve }));
vi.mock("./marketstack.server", async (original) => ({
  ...(await original<typeof import("./marketstack.server")>()),
  fetchMarketstackPage: mocks.fetch,
}));
vi.mock("../resource-context.server", () => ({
  startReadBudget: vi.fn(),
  checkResourceBudget: vi.fn(),
  createUserScopedSharedWork: () => (_key: string, work: () => unknown) =>
    work(),
}));
import { Temporal } from "../../shared/temporal";
import { securityHistory } from "./history.server";
const row = {
  id: "listing",
  selectionToken: "reference",
  currency: null,
  securityType: null,
  name: "ABC",
  symbol: "ABC",
  exchange: "NASDAQ",
  mic: "XNAS",
  country: null,
  hasHistory: true,
};
const find = mocks.resolve;
const input = { selectionToken: "reference" };
const price = {
  symbol: "ABC",
  exchange: "XNAS",
  date: "2026-11-10",
  close: 10,
  price_currency: "USD",
  asset_type: "Stock",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Temporal.Now, "plainDateISO").mockImplementation(() =>
    Temporal.Instant.fromEpochMilliseconds(Date.now())
      .toZonedDateTimeISO("UTC")
      .toPlainDate(),
  );
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T10:00:00Z"));
  vi.spyOn(Temporal.Now, "instant").mockImplementation(() =>
    Temporal.Instant.fromEpochMilliseconds(Date.now()),
  );
  find.mockReturnValue(row);
  mocks.redis.mockResolvedValue({ get: mocks.get, set: mocks.set });
  mocks.get.mockResolvedValue(null);
  mocks.set.mockResolvedValue(undefined);
  mocks.fetch.mockResolvedValue({
    data: [price],
    pagination: { offset: 0, count: 1, total: 1 },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("selected Securities history", () => {
  test("keeps later-page omissions without shifting offsets and caches partial results", async () => {
    mocks.fetch
      .mockResolvedValueOnce({
        data: [price, { ...price, date: "2026-11-11", close: null }],
        pagination: { offset: 0, count: 2, total: 4 },
      })
      .mockResolvedValueOnce({
        data: [
          { ...price, date: "2026-11-12", close: 0 },
          { ...price, date: "2026-11-13", close: 13 },
        ],
        pagination: { offset: 2, count: 2, total: 4 },
      });
    const result = await securityHistory(input);
    expect(result).toMatchObject({
      status: "ready",
      points: [
        { date: price.date, close: 10 },
        { date: "2026-11-13", close: 13 },
      ],
      omissions: [
        { date: "2026-11-11", reason: "missing" },
        { date: "2026-11-12", reason: "non-positive" },
      ],
    });
    expect(mocks.fetch.mock.calls[1]![1]).toMatchObject({ offset: "2" });
    mocks.get.mockResolvedValue(mocks.set.mock.calls[0]![1]);
    mocks.fetch.mockClear();
    expect(await securityHistory(input)).toEqual(result);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.set.mock.calls[0]![2]).toEqual({ EX: 86400 });
  });
  test.each(["no-data", "no-usable-prices", "invalid-data"] as const)(
    "caches %s for five minutes without paid retries",
    async (reason) => {
      if (reason === "invalid-data")
        mocks.fetch.mockResolvedValue({
          data: [{ ...price, exchange: "OTHER" }],
          pagination: { offset: 0, count: 1, total: 1 },
        });
      else
        mocks.fetch.mockResolvedValue({
          data: reason === "no-data" ? [] : [{ ...price, close: "bad" }],
          pagination: {
            offset: 0,
            count: reason === "no-data" ? 0 : 1,
            total: reason === "no-data" ? 0 : 1,
          },
        });
      const first = await securityHistory(input);
      expect(first).toMatchObject({
        status: "unavailable",
        reason,
        points: [],
        retryAt: "2026-11-16T10:05:00Z",
      });
      expect(mocks.set.mock.calls[0]![2]).toEqual({ EX: 300 });
      mocks.get.mockResolvedValue(mocks.set.mock.calls[0]![1]);
      mocks.fetch.mockClear();
      vi.advanceTimersByTime(299000);
      expect(await securityHistory(input)).toEqual(first);
      expect(mocks.fetch).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      await securityHistory(input);
      expect(mocks.fetch).toHaveBeenCalledOnce();
    },
  );
  test.each(["credentials", "subscription", "quota", "timeout", "cancelled"])(
    "does not cache %s failures",
    async (message) => {
      mocks.fetch.mockRejectedValue(new Error(message));
      await expect(securityHistory(input)).rejects.toThrow(message);
      expect(mocks.set).not.toHaveBeenCalled();
    },
  );
  test("resolves signed identity, follows all pages and caches the full five-year window", async () => {
    mocks.fetch
      .mockResolvedValueOnce({
        data: [price],
        pagination: { offset: 0, count: 1, total: 2 },
      })
      .mockResolvedValueOnce({
        data: [{ ...price, date: "2026-11-11", close: 11 }],
        pagination: { offset: 1, count: 1, total: 2 },
      });
    const result = await securityHistory(input);
    expect(find).toHaveBeenCalledWith("reference");
    expect(result).toMatchObject({
      from: "2021-11-16",
      through: "2026-11-16",
      listing: { currency: "USD", securityType: "Stock" },
      points: [
        { date: "2026-11-10", close: 10 },
        { date: "2026-11-11", close: 11 },
      ],
    });
    expect(mocks.fetch.mock.calls[1]![1]).toMatchObject({
      offset: "1",
      exchange: "XNAS",
      symbols: "ABC",
      sort: "ASC",
    });
    expect(mocks.set).toHaveBeenCalledWith(
      expect.stringContaining("securities:marketstack:history:v2:"),
      expect.any(String),
      { EX: 86400 },
    );
  });
  test("validates cached data and isolates caches by exchange and UTC day", async () => {
    mocks.get.mockResolvedValueOnce(
      JSON.stringify({
        status: "ready",
        omissions: [],
        points: [{ date: "2026-11-10", close: 15 }],
        currency: null,
        securityType: null,
      }),
    );
    expect((await securityHistory(input)).listing.currency).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
    const firstKey = mocks.get.mock.calls[0]![0];
    find.mockReturnValue({ ...row, mic: "XLON" });
    mocks.fetch.mockResolvedValue({
      data: [{ ...price, exchange: "XLON" }],
      pagination: { offset: 0, count: 1, total: 1 },
    });
    await securityHistory(input);
    expect(mocks.get.mock.calls[1]![0]).not.toBe(firstKey);
    vi.setSystemTime(new Date("2026-11-17T00:00:00Z"));
    await securityHistory(input);
    expect(mocks.get.mock.calls[2]![0]).not.toBe(mocks.get.mock.calls[1]![0]);
  });
  test("cache failures and corrupt entries fall back to live retrieval", async () => {
    mocks.redis.mockRejectedValueOnce(new Error("offline"));
    await securityHistory(input);
    mocks.get.mockResolvedValueOnce("{invalid");
    await securityHistory(input);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  test("keeps unavailable listings copyable, but never guesses an exchange", async () => {
    find.mockReturnValueOnce({ ...row, hasHistory: false });
    expect((await securityHistory(input)).points).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
    find.mockReturnValueOnce({ ...row, mic: "" });
    await expect(securityHistory(input)).rejects.toThrow("no exchange MIC");
    find.mockImplementationOnce(() => {
      throw new Error("Search again.");
    });
    await expect(securityHistory(input)).rejects.toThrow("Search again");
  });
  test("loads unknown availability, caches no-data and leaves provider failures uncached", async () => {
    find.mockReturnValue({ ...row, hasHistory: null });
    mocks.fetch.mockResolvedValueOnce({
      data: [],
      pagination: { offset: 0, count: 0, total: 0 },
    });
    expect((await securityHistory(input)).points).toEqual([]);
    expect(mocks.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { EX: 300 },
    );
    mocks.set.mockClear();
    mocks.fetch.mockRejectedValueOnce(new Error("quota"));
    await expect(securityHistory(input)).rejects.toThrow("quota");
    expect(mocks.set).not.toHaveBeenCalled();
  });
  test("rejects partial, changing and exchange-mismatched history", async () => {
    mocks.fetch
      .mockResolvedValueOnce({
        data: [price],
        pagination: { offset: 0, count: 1, total: 2 },
      })
      .mockResolvedValueOnce({
        data: [],
        pagination: { offset: 1, count: 0, total: 2 },
      });
    await expect(securityHistory(input)).resolves.toMatchObject({
      status: "unavailable",
      reason: "invalid-data",
    });
    mocks.fetch.mockResolvedValueOnce({
      data: [{ ...price, exchange: "XLON" }],
      pagination: { offset: 0, count: 1, total: 1 },
    });
    await expect(securityHistory(input)).resolves.toMatchObject({
      status: "unavailable",
      reason: "invalid-data",
    });
    expect(mocks.set).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      { EX: 300 },
    );
  });
});

test("verified references preserve exact identities and reject tampering before any history work", async () => {
  vi.stubEnv("SESSION_SECRET", "test-only-key");
  const { issueListing, resolveListing } =
    await vi.importActual<typeof import("./selection.server")>(
      "./selection.server",
    );
  find.mockImplementation(resolveListing);
  const listing = issueListing({
    symbol: "NEE 6.219",
    name: "Example",
    exchange: "Fund Exchange",
    mic: "NMFQS",
    country: null,
    hasHistory: null,
  });
  mocks.fetch.mockResolvedValueOnce({
    data: [{ ...price, symbol: listing.symbol, exchange: listing.mic }],
    pagination: { offset: 0, count: 1, total: 1 },
  });
  await expect(
    securityHistory({ selectionToken: listing.selectionToken }),
  ).resolves.toMatchObject({ listing: { symbol: "NEE 6.219", mic: "NMFQS" } });
  expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(
    "eod",
    expect.objectContaining({ symbols: "NEE 6.219", exchange: "NMFQS" }),
  );
  mocks.fetch.mockClear();
  mocks.get.mockClear();
  await expect(
    securityHistory({ selectionToken: listing.selectionToken + "tampered" }),
  ).rejects.toThrow("Search again");
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.get).not.toHaveBeenCalled();
});
