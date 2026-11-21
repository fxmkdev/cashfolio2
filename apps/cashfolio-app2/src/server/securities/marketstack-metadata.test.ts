import { afterEach, beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  key: vi.fn(),
  record: vi.fn(),
  attempt: vi.fn(),
  budget: vi.fn(),
}));
vi.mock("../valuation/provider-api-key.server", () => ({
  getProviderApiKey: mocks.key,
}));
vi.mock("../valuation/provider-usage.server", () => ({
  recordValuationProviderRequest: mocks.record,
}));
vi.mock("../resource-context.server", () => ({
  checkResourceBudget: mocks.budget,
  consumeProviderAttempt: mocks.attempt,
  getResourceSignal: () => undefined,
}));
vi.mock("node:timers/promises", () => ({ setTimeout: async () => undefined }));
import { fetchMarketstackTicker } from "./marketstack.server";
const raw = {
  symbol: "NEE 6.219",
  stock_exchange: { mic: "NMFQS" },
  isin: "US0000000000",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.key.mockResolvedValue("secret-test-key");
  mocks.record.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());
test("requests only the encoded selected symbol and records one sanitized metadata attempt", async () => {
  const symbol = "NEE 6.219/A%?B";
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ ...raw, symbol }));
  expect(await fetchMarketstackTicker(symbol, "NMFQS")).toEqual({
    symbol,
    mic: "NMFQS",
    isin: raw.isin,
  });
  expect(fetch).toHaveBeenCalledOnce();
  const url = new URL(String(fetch.mock.calls[0]![0]));
  expect(url.pathname).toBe(`/v2/tickers/${encodeURIComponent(symbol)}`);
  expect([...url.searchParams.keys()]).toEqual(["access_key"]);
  expect(mocks.record).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      requestReason: "SECURITY_METADATA",
      symbol,
      outcome: "RETRIEVED",
    }),
  );
  expect(JSON.stringify(mocks.record.mock.calls)).not.toContain(
    "secret-test-key",
  );
});
test("validated missing ISINs report no data without requiring pagination", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    Response.json({ ...raw, isin: null }),
  );
  expect((await fetchMarketstackTicker(raw.symbol, "NMFQS")).isin).toBeNull();
  expect(mocks.record).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      requestReason: "SECURITY_METADATA",
      outcome: "NO_DATA",
    }),
  );
});
test("identity and ISIN failures are rejected once, with safe provider-error reporting", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  for (const value of [
    { ...raw, symbol: "OTHER" },
    { ...raw, stock_exchange: { mic: "XNAS" } },
    { ...raw, isin: "arbitrary-secret-provider-text" },
    [],
    { data: raw },
  ]) {
    fetch.mockResolvedValueOnce(Response.json(value));
    await expect(fetchMarketstackTicker(raw.symbol, "NMFQS")).rejects.toThrow();
  }
  expect(fetch).toHaveBeenCalledTimes(5);
  expect(
    mocks.record.mock.calls.every(
      ([entry]) => entry.outcome === "PROVIDER_ERROR",
    ),
  ).toBe(true);
  expect(JSON.stringify(mocks.record.mock.calls)).not.toContain(
    "arbitrary-secret-provider-text",
  );
});
test("retries transient failures on the same selected path and records every attempt", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockRejectedValueOnce(new TypeError("network"))
    .mockResolvedValueOnce(Response.json(raw));
  await fetchMarketstackTicker(raw.symbol, "NMFQS");
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(new Set(fetch.mock.calls.map(([url]) => String(url))).size).toBe(1);
  expect(mocks.attempt).toHaveBeenCalledTimes(3);
  expect(mocks.record.mock.calls.map(([entry]) => entry.outcome)).toEqual([
    "HTTP_ERROR",
    "REQUEST_ERROR",
    "RETRIEVED",
  ]);
});
test("keeps authentication, configuration and quota errors bounded and does not call an aborted request", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  mocks.key.mockResolvedValueOnce(null);
  await expect(fetchMarketstackTicker(raw.symbol, "NMFQS")).rejects.toThrow(
    "not configured",
  );
  expect(fetch).not.toHaveBeenCalled();
  for (const [status, message] of [
    [401, "credentials"],
    [403, "subscription"],
    [200, "quota"],
  ] as const) {
    fetch.mockResolvedValueOnce(
      Response.json(
        { error: { code: status === 200 ? "usage_limit_reached" : "error" } },
        { status },
      ),
    );
    await expect(fetchMarketstackTicker(raw.symbol, "NMFQS")).rejects.toThrow(
      message,
    );
  }
  expect(fetch).toHaveBeenCalledTimes(3);
  fetch.mockClear();
  await expect(
    fetchMarketstackTicker(raw.symbol, "NMFQS", {
      signal: AbortSignal.abort(new Error("cancelled")),
    }),
  ).rejects.toThrow("cancelled");
  expect(fetch).not.toHaveBeenCalled();
});
