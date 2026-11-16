import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PrismaClient } from "../../.prisma-client/client";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  redis: vi.fn(),
  snapshot: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock("../../redis.server", () => ({ getRedisClient: mocks.redis }));
vi.mock("./store.server", async (original) => ({
  ...(await original<typeof import("./store.server")>()),
  readSnapshot: mocks.snapshot,
}));
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
  snapshotId: "version",
  name: "ABC",
  symbol: "ABC",
  exchange: "NASDAQ",
  exchangeLabel: "NASDAQ (XNAS)",
  mic: "XNAS",
  country: null,
  hasHistory: true,
};
const find = vi.fn();
const db = {
  securityCatalogueListing: { findFirst: find },
} as unknown as PrismaClient;
const input = { version: "version", id: "listing" };
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
  mocks.snapshot.mockResolvedValue({});
  find.mockResolvedValue(row);
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
});
describe("selected Securities history", () => {
  test("resolves stored identity, follows all pages and caches the full five-year window", async () => {
    mocks.fetch
      .mockResolvedValueOnce({
        data: [price],
        pagination: { offset: 0, count: 1, total: 2 },
      })
      .mockResolvedValueOnce({
        data: [{ ...price, date: "2026-11-11", close: 11 }],
        pagination: { offset: 1, count: 1, total: 2 },
      });
    const result = await securityHistory(db, input);
    expect(find).toHaveBeenCalledWith({
      where: { id: "listing", snapshotId: "version" },
    });
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
      expect.stringContaining("securities:marketstack:history:v1:"),
      expect.any(String),
      { EX: 86400 },
    );
  });
  test("validates cached data and isolates caches by exchange and UTC day", async () => {
    mocks.get.mockResolvedValueOnce(
      JSON.stringify({
        points: [{ date: "2026-11-10", close: 15 }],
        currency: null,
        securityType: null,
      }),
    );
    expect((await securityHistory(db, input)).listing.currency).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
    const firstKey = mocks.get.mock.calls[0]![0];
    find.mockResolvedValue({ ...row, mic: "XLON" });
    mocks.fetch.mockResolvedValue({
      data: [{ ...price, exchange: "XLON" }],
      pagination: { offset: 0, count: 1, total: 1 },
    });
    await securityHistory(db, input);
    expect(mocks.get.mock.calls[1]![0]).not.toBe(firstKey);
    vi.setSystemTime(new Date("2026-11-17T00:00:00Z"));
    await securityHistory(db, input);
    expect(mocks.get.mock.calls[2]![0]).not.toBe(mocks.get.mock.calls[1]![0]);
  });
  test("cache failures and corrupt entries fall back to live retrieval", async () => {
    mocks.redis.mockRejectedValueOnce(new Error("offline"));
    await securityHistory(db, input);
    mocks.get.mockResolvedValueOnce("{invalid");
    await securityHistory(db, input);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  test("keeps unavailable listings copyable, but never guesses an exchange", async () => {
    find.mockResolvedValueOnce({ ...row, hasHistory: false });
    expect((await securityHistory(db, input)).points).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
    find.mockResolvedValueOnce({ ...row, mic: "" });
    await expect(securityHistory(db, input)).rejects.toThrow("no exchange MIC");
    find.mockResolvedValueOnce(null);
    await expect(securityHistory(db, input)).rejects.toThrow(
      "no longer available",
    );
  });
  test("loads unknown availability, does not cache missing history or provider failures", async () => {
    find.mockResolvedValue({ ...row, hasHistory: null });
    mocks.fetch.mockResolvedValueOnce({
      data: [],
      pagination: { offset: 0, count: 0, total: 0 },
    });
    expect((await securityHistory(db, input)).points).toEqual([]);
    expect(mocks.set).not.toHaveBeenCalled();
    mocks.fetch.mockRejectedValueOnce(new Error("quota"));
    await expect(securityHistory(db, input)).rejects.toThrow("quota");
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
    await expect(securityHistory(db, input)).rejects.toThrow("incomplete");
    mocks.fetch.mockResolvedValueOnce({
      data: [{ ...price, exchange: "XLON" }],
      pagination: { offset: 0, count: 1, total: 1 },
    });
    await expect(securityHistory(db, input)).rejects.toThrow(
      "different listing",
    );
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
