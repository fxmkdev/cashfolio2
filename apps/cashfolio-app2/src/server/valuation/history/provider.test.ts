import { beforeEach, expect, it, vi } from "vitest";
import type { HistoryTask } from "./types";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), record: vi.fn() }));
vi.mock("../provider-api-key", () => ({
  getProviderApiKey: async () => "test",
}));
vi.mock("../providers/request", () => ({ fetchProviderResponse: mocks.fetch }));
vi.mock("../provider-usage", () => ({
  recordValuationProviderRequest: mocks.record,
}));
import { fetchHistory } from "./provider";
import { HistoryFeatureUnavailable } from "./types";
const stock: HistoryTask = {
  mode: "range",
  from: "2026-01-01",
  to: "2026-01-31",
  series: [
    { provider: "MARKETSTACK", code: "ABC", currency: "USD", key: "stock" },
  ],
};
const page = (date: string, offset = 0, total = 2, currency = "USD") => ({
  pagination: { offset, total, count: 1 },
  data: [{ date, symbol: "ABC", currency, close: 100 }],
});
beforeEach(() => vi.resetAllMocks());
it("validates every page before completing stock coverage", async () => {
  mocks.fetch
    .mockResolvedValueOnce(Response.json(page("2026-01-02")))
    .mockResolvedValueOnce(Response.json(page("2026-01-03", 1)));
  const result = await fetchHistory(stock);
  expect(result).toEqual({
    complete: true,
    points: {
      stock: [
        { date: "2026-01-02", value: 100 },
        { date: "2026-01-03", value: 100 },
      ],
    },
  });
  expect(mocks.fetch.mock.calls[1]![0].url).toContain("offset=1");
});
it.each([
  page("2026-02-02"),
  { pagination: { offset: 0, total: 2, count: 0 }, data: [] },
])("rejects invalid range and incomplete pagination", async (body) => {
  mocks.fetch.mockResolvedValue(Response.json(body));
  await expect(fetchHistory(stock)).rejects.toThrow();
});
it("rejects a failed later page without publishing a partial range", async () => {
  mocks.fetch
    .mockResolvedValueOnce(Response.json(page("2026-01-02")))
    .mockResolvedValueOnce(
      Response.json({ error: { code: 429 } }, { status: 429 }),
    );
  await expect(fetchHistory(stock)).rejects.toThrow("429");
});
it("separates unsupported features from auth, quota and transient failures", async () => {
  mocks.fetch.mockResolvedValueOnce(
    Response.json({ success: false, error: { code: 105 } }),
  );
  await expect(fetchHistory(stock)).rejects.toBeInstanceOf(
    HistoryFeatureUnavailable,
  );
  for (const status of [401, 403, 429, 503]) {
    mocks.fetch.mockResolvedValueOnce(
      Response.json({ error: { code: status } }, { status }),
    );
    await expect(fetchHistory(stock)).rejects.not.toBeInstanceOf(
      HistoryFeatureUnavailable,
    );
  }
});
it("validates currency timeframe metadata, base and every rate", async () => {
  const task: HistoryTask = {
    ...stock,
    to: "2026-01-02",
    series: [
      { provider: "CURRENCYLAYER", code: "CHF", currency: "USD", key: "fx" },
    ],
  };
  const valid = {
    success: true,
    timeframe: true,
    start_date: task.from,
    end_date: task.to,
    source: "USD",
    quotes: { "2026-01-01": { USDCHF: 0.9 }, "2026-01-02": { USDCHF: 0.91 } },
  };
  mocks.fetch.mockResolvedValueOnce(Response.json(valid));
  expect((await fetchHistory(task)).points.fx).toHaveLength(2);
  for (const body of [
    { ...valid, source: "EUR" },
    { ...valid, end_date: task.from },
    { ...valid, quotes: { "2026-01-01": { USDCHF: -1 } } },
  ]) {
    mocks.fetch.mockResolvedValueOnce(Response.json(body));
    await expect(fetchHistory(task)).rejects.toThrow();
  }
});
it("retains valid quotes while identifying nullable range closes as unproven dates", async () => {
  mocks.fetch.mockResolvedValueOnce(
    Response.json({
      pagination: { offset: 0, total: 2, count: 2 },
      data: [
        { date: "2026-01-02", symbol: "ABC", close: 100 },
        { date: "2026-01-03", symbol: "ABC", close: null },
      ],
    }),
  );
  expect(await fetchHistory(stock)).toEqual({
    complete: true,
    points: { stock: [{ date: "2026-01-02", value: 100 }] },
    unavailable: { stock: ["2026-01-03"] },
  });
});
it("excludes v2 quotes in another currency and leaves their dates unproven", async () => {
  mocks.fetch.mockResolvedValueOnce(
    Response.json({
      pagination: { offset: 0, total: 1, count: 1 },
      data: [
        {
          date: "2026-01-02",
          symbol: "ABC",
          price_currency: "CHF",
          close: 100,
        },
      ],
    }),
  );
  expect(await fetchHistory(stock)).toEqual({
    complete: true,
    points: { stock: [] },
    unavailable: { stock: ["2026-01-02"] },
  });
});
it("selects the matching-currency listing without proving the other listing's absence", async () => {
  mocks.fetch.mockResolvedValueOnce(
    Response.json({
      pagination: { offset: 0, total: 2, count: 2 },
      data: [
        { date: "2026-01-02", symbol: "ABC", price_currency: "EUR", close: 90 },
        {
          date: "2026-01-02",
          symbol: "ABC",
          price_currency: "USD",
          close: 100,
        },
      ],
    }),
  );
  expect(await fetchHistory(stock)).toEqual({
    complete: true,
    points: { stock: [{ date: "2026-01-02", value: 100 }] },
  });
});
it("rejects duplicate matching-currency quotes rather than selecting an arbitrary listing", async () => {
  mocks.fetch.mockResolvedValueOnce(
    Response.json({
      pagination: { offset: 0, total: 2, count: 2 },
      data: [
        { date: "2026-01-02", symbol: "ABC", price_currency: "USD", close: 90 },
        {
          date: "2026-01-02",
          symbol: "ABC",
          price_currency: "USD",
          close: 100,
        },
      ],
    }),
  );
  await expect(fetchHistory(stock)).rejects.toThrow("Duplicate");
});
