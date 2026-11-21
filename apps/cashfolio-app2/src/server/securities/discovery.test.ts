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
  checkResourceBudget: mocks.budget,
  createUserScopedSharedWork: () => (_key: string, work: () => unknown) =>
    work(),
}));
vi.mock("./marketstack.server", async (original) => ({
  ...(await original<typeof import("./marketstack.server")>()),
  fetchMarketstackPage: mocks.fetch,
}));
import { exchangeDirectory, searchListings } from "./discovery.server";
import { resolveListing } from "./selection.server";
const query = {
  criteria: { query: "Example", exchange: null },
  offset: 0,
  limit: 20,
};
const raw = {
  ticker: "NEE 6.219",
  name: "Example",
  stock_exchange: { name: "Xetra", mic: "XETRA", country: null },
  has_eod: null,
};
const page = (data: unknown[], offset = 0, total = data.length) => ({
  data,
  pagination: { offset, count: data.length, total },
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SESSION_SECRET", "test-only-key");
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Unexpected network request"),
  );
  mocks.redis.mockResolvedValue({ get: mocks.get, set: mocks.set });
  mocks.get.mockResolvedValue(null);
  mocks.fetch.mockResolvedValue(page([raw]));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
test("requests exactly the browsed page, preserving provider order, total and exact identity", async () => {
  mocks.fetch.mockResolvedValue(
    page(
      [
        raw,
        { ...raw, ticker: "AAA" },
        ...Array.from({ length: 18 }, (_, index) => ({
          ...raw,
          ticker: `OTHER${index}`,
        })),
      ],
      40,
      63,
    ),
  );
  const result = await searchListings({
    ...query,
    criteria: { query: "Example", exchange: "XETRA" },
    offset: 40,
  });
  expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith("tickerslist", {
    search: "Example",
    exchange: "XETRA",
    limit: "20",
    offset: "40",
  });
  expect(result.totalCount).toBe(63);
  expect(result.rows.slice(0, 2).map((row) => row.symbol)).toEqual([
    "NEE 6.219",
    "AAA",
  ]);
  expect(resolveListing(result.rows[0]!.selectionToken)).toEqual(
    result.rows[0],
  );
  expect(mocks.set.mock.calls[0]![2]).toEqual({ EX: 86400 });
});
test("explicit empty search omits optional parameters and caches empty pages", async () => {
  mocks.fetch.mockResolvedValue(page([]));
  expect(
    await searchListings({ ...query, criteria: { query: "", exchange: null } }),
  ).toEqual({ rows: [], totalCount: 0 });
  expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith("tickerslist", {
    limit: "20",
    offset: "0",
  });
  mocks.get.mockResolvedValue(mocks.set.mock.calls[0]![1]);
  mocks.fetch.mockClear();
  await searchListings({ ...query, criteria: { query: "", exchange: null } });
  expect(mocks.fetch).not.toHaveBeenCalled();
});
test("caches a requested empty page beyond a reduced total without scanning a replacement", async () => {
  mocks.fetch.mockResolvedValueOnce(page([], 40, 5));
  const input = { ...query, offset: 40 };
  await expect(searchListings(input)).resolves.toEqual({
    rows: [],
    totalCount: 5,
  });
  expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith("tickerslist", {
    search: "Example",
    limit: "20",
    offset: "40",
  });
  expect(mocks.set.mock.calls[0]![2]).toEqual({ EX: 86400 });
  mocks.get.mockResolvedValueOnce(mocks.set.mock.calls[0]![1]);
  await expect(searchListings(input)).resolves.toEqual({
    rows: [],
    totalCount: 5,
  });
  expect(mocks.fetch).toHaveBeenCalledOnce();
});
test("cache hits issue trusted references without provider calls; keys isolate query, exchange and page", async () => {
  const first = await searchListings(query);
  const key = mocks.get.mock.calls[0]![0];
  mocks.get.mockResolvedValueOnce(mocks.set.mock.calls[0]![1]);
  expect(await searchListings(query)).toMatchObject({
    rows: first.rows.map(({ selectionToken: _token, ...row }) => row),
    totalCount: 1,
  });
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  for (const input of [
    { ...query, criteria: { ...query.criteria, query: "Other" } },
    { ...query, criteria: { ...query.criteria, exchange: "XETRA" } },
    { ...query, offset: 20 },
  ]) {
    mocks.fetch.mockResolvedValue(page([raw], input.offset, input.offset + 1));
    await searchListings(input);
    expect(mocks.get.mock.lastCall![0]).not.toBe(key);
  }
});
test("invalid cache payloads and unavailable Redis fall back only to the requested page", async () => {
  for (const value of [
    "{",
    "null",
    JSON.stringify({ rows: [{ symbol: "bad" }], totalCount: 1 }),
    JSON.stringify({ rows: [], totalCount: -1 }),
  ]) {
    mocks.get.mockResolvedValueOnce(value);
    await searchListings(query);
  }
  mocks.redis.mockRejectedValueOnce(new Error("offline"));
  await searchListings(query);
  expect(mocks.fetch).toHaveBeenCalledTimes(5);
});
test("rejects oversized or mismatched listing pages without scanning or caching errors", async () => {
  for (const rows of [
    Array.from({ length: 21 }, () => raw),
    [{ ...raw, stock_exchange: { mic: "OTHER" } }],
    [raw, raw],
  ]) {
    mocks.fetch.mockResolvedValueOnce(page(rows));
    await expect(
      searchListings({
        ...query,
        criteria: { ...query.criteria, exchange: "XETRA" },
      }),
    ).rejects.toThrow();
  }
  expect(mocks.fetch).toHaveBeenCalledTimes(3);
  expect(mocks.set).not.toHaveBeenCalled();
});
test("loads only exchange metadata, follows its raw pagination and caches the complete directory for seven days", async () => {
  mocks.fetch
    .mockResolvedValueOnce(page([{ name: "Xetra", mic: "XETRA" }], 0, 2))
    .mockResolvedValueOnce(
      page([{ name: "Fund Exchange", mic: "NMFQS" }], 1, 2),
    );
  const expected = [
    { value: "XETRA", label: "Xetra (XETRA)" },
    { value: "NMFQS", label: "Fund Exchange (NMFQS)" },
  ];
  expect(await exchangeDirectory()).toEqual(expected);
  expect(mocks.fetch.mock.calls).toEqual([
    ["exchanges", { limit: "1000", offset: "0" }],
    ["exchanges", { limit: "1000", offset: "1" }],
  ]);
  expect(mocks.set.mock.calls[0]![2]).toEqual({ EX: 604800 });
  mocks.get.mockResolvedValue(mocks.set.mock.calls[0]![1]);
  mocks.fetch.mockClear();
  expect(await exchangeDirectory()).toEqual(expected);
  expect(mocks.fetch).not.toHaveBeenCalled();
});
test("rejects incomplete, changing, oversized and invalid exchange directories", async () => {
  for (const response of [
    page([], 0, 2),
    page([{ mic: "bad code", name: "Exchange" }]),
    page([], 0, 10001),
    page([{ mic: "XNAS", name: null }]),
  ]) {
    mocks.fetch.mockResolvedValueOnce(response);
    await expect(exchangeDirectory()).rejects.toThrow();
  }
  mocks.fetch
    .mockResolvedValueOnce(page([{ mic: "XNAS", name: "NASDAQ" }], 0, 2))
    .mockResolvedValueOnce(page([], 1, 1));
  await expect(exchangeDirectory()).rejects.toThrow("incomplete");
  expect(mocks.set).not.toHaveBeenCalled();
});
test("cancellation, quota and transport failures never become cached successes", async () => {
  for (const error of [
    new Error("cancelled"),
    new Error("quota"),
    new Error("temporarily unavailable"),
  ]) {
    mocks.fetch.mockRejectedValueOnce(error);
    await expect(searchListings(query)).rejects.toBe(error);
  }
  mocks.budget.mockImplementationOnce(() => {
    throw new Error("cancelled");
  });
  await expect(exchangeDirectory()).rejects.toThrow("cancelled");
  expect(mocks.set).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
