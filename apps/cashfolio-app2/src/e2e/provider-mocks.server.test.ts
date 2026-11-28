import { createServer } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("E2E valuation provider interception", () => {
  let ensureMocks: typeof import("./provider-mocks.server").ensureE2EValuationProviderMocksEnabled;
  let cleanupMocks: ((code: number) => void) | undefined;

  function enableMocks() {
    const previousListeners = new Set(process.listeners("exit"));
    ensureMocks();
    cleanupMocks ??= process
      .listeners("exit")
      .find((listener) => !previousListeners.has(listener));
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.spyOn(console, "info").mockImplementation(() => {});
    ({ ensureE2EValuationProviderMocksEnabled: ensureMocks } =
      await import("./provider-mocks.server"));
  });

  afterEach(() => {
    if (cleanupMocks) {
      process.removeListener("exit", cleanupMocks);
      cleanupMocks(0);
      cleanupMocks = undefined;
    }
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("enables interception and registers cleanup only once", async () => {
    const listenerCount = process.listenerCount("exit");
    enableMocks();
    enableMocks();
    expect(process.listenerCount("exit")).toBe(listenerCount + 1);
    expect(console.info).toHaveBeenCalledOnce();
    const response = await fetch(
      "https://api.currencylayer.com/historical?currencies=CHF",
    );
    expect(await response.json()).toEqual({
      success: true,
      quotes: { USDCHF: 0.5 },
    });
  });

  it.each([
    [
      "https://api.currencylayer.com/historical?currencies=USD",
      { success: true, quotes: { USDUSD: 1 } },
    ],
    [
      "https://api.currencylayer.com/historical?currencies=%20chf%20",
      { success: true, quotes: { USDCHF: 0.5 } },
    ],
    [
      "https://api.currencylayer.com/historical?currencies=EUR",
      { success: true, quotes: { USDEUR: 1.1 } },
    ],
    [
      "https://api.coinlayer.com/2026-01-10?symbols=%20btc%20",
      { success: true, rates: { BTC: 200 } },
    ],
    [
      "https://api.coinlayer.com/2026-01-10?symbols=ETH",
      { success: true, rates: { ETH: 100 } },
    ],
    [
      "https://api.marketstack.com/v2/eod/2026-01-10?symbols=AAPL",
      { data: [{ close: 10 }] },
    ],
    [
      "https://api.marketstack.com/v2/eod/2023-12-09?symbols=%20msft%20",
      { data: [{ close: 400 }] },
    ],
  ])("returns the deterministic response for %s", async (url, expected) => {
    enableMocks();
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expected);
  });

  it.each([
    [
      "https://api.currencylayer.com/historical",
      {
        success: false,
        error: { code: 106, info: "No data available for UNKNOWN" },
      },
    ],
    [
      "https://api.currencylayer.com/historical?currencies=ZZZ",
      {
        success: false,
        error: { code: 106, info: "No data available for ZZZ" },
      },
    ],
    [
      "https://api.coinlayer.com/2026-01-10",
      {
        success: false,
        error: { code: 106, info: "No data available for UNKNOWN" },
      },
    ],
    [
      "https://api.coinlayer.com/2026-01-10?symbols=ZZZ",
      {
        success: false,
        error: { code: 106, info: "No data available for ZZZ" },
      },
    ],
    [
      "https://api.marketstack.com/v2/eod/2026-01-10",
      { error: { message: "did not return any results" } },
    ],
    [
      "https://api.marketstack.com/v2/eod/2026-01-10?symbols=CFDEMO_UNLISTED",
      { error: { message: "did not return any results" } },
    ],
  ])("preserves the no-data response for %s", async (url, expected) => {
    enableMocks();
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expected);
  });

  it.each([
    "https://api.currencylayer.com/unmatched/path",
    "https://api.coinlayer.com/unmatched/path",
    "https://api.marketstack.com/unmatched/path",
  ])("blocks unmatched provider requests to %s", async (url) => {
    enableMocks();
    const response = await fetch(url);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      message: `Unhandled E2E valuation provider request: GET ${url}`,
    });
  });

  it("mocks requested Securities pages and exact exchange choices", async () => {
    enableMocks();
    const rows = await (
      await fetch(
        "https://api.marketstack.com/v2/tickerslist?search=E2E.PAGE&limit=20&offset=20",
      )
    ).json();
    expect(rows.pagination).toMatchObject({ offset: 20, count: 4, total: 24 });
    expect(rows.data[0].ticker).toBe("E2E.PAGE.21");
    const selected = await (
      await fetch(
        "https://api.marketstack.com/v2/tickerslist?search=E2E.SEC&exchange=XSWX&limit=20&offset=0",
      )
    ).json();
    expect(selected.data).toHaveLength(1);
    expect(selected.data[0].stock_exchange.mic).toBe("XSWX");
    const exchanges = await (
      await fetch(
        "https://api.marketstack.com/v2/exchanges?limit=1000&offset=0",
      )
    ).json();
    expect(exchanges.data.map((row: { mic: string }) => row.mic)).toEqual([
      "XNAS",
      "XSWX",
    ]);
  });

  it("keeps return-history ranges separate from exchange-scoped Securities history", async () => {
    enableMocks();
    const prices = await (
      await fetch(
        "https://api.marketstack.com/v2/eod?symbols=AAPL,MSFT&date_from=2026-01-10&date_to=2026-01-11&limit=2&offset=1",
      )
    ).json();
    expect(prices).toEqual({
      pagination: { offset: 1, total: 4, count: 2, limit: 2 },
      data: [
        { symbol: "MSFT", date: "2026-01-10", close: 12 },
        { symbol: "AAPL", date: "2026-01-11", close: 10 },
      ],
    });
    const selected = await (
      await fetch(
        "https://api.marketstack.com/v2/eod?symbols=E2E.SEC&exchange=XSWX&date_from=2021-01-01&date_to=2026-01-01&limit=2&offset=1",
      )
    ).json();
    expect(selected.pagination).toEqual({
      offset: 1,
      limit: 2,
      count: 2,
      total: 61,
    });
    expect(selected.data).toEqual([
      {
        date: "2021-02-01",
        close: 101,
        symbol: "E2E.SEC",
        exchange: "XSWX",
        price_currency: "CHF",
        asset_type: "Stock",
      },
      {
        date: "2021-03-01",
        close: 102,
        symbol: "E2E.SEC",
        exchange: "XSWX",
        price_currency: "CHF",
        asset_type: "Stock",
      },
    ]);
  });

  it("preserves nullable and zero Securities quotes in the combined range handler", async () => {
    enableMocks();
    const selected = await (
      await fetch(
        "https://api.marketstack.com/v2/eod?symbols=E2E.PARTIAL&exchange=XNAS&date_from=2021-01-01&date_to=2026-01-01&limit=3&offset=58",
      )
    ).json();
    expect(selected.pagination).toEqual({
      offset: 58,
      limit: 3,
      count: 3,
      total: 61,
    });
    expect(
      selected.data.map((row: { close: number | null }) => row.close),
    ).toEqual([null, 0, 160]);
    expect(
      selected.data.every(
        (row: { price_currency: string }) => row.price_currency === "USD",
      ),
    ).toBe(true);
  });

  it("mocks selected ticker metadata, missing ISINs and metadata outages", async () => {
    enableMocks();
    const ticker = await (
      await fetch("https://api.marketstack.com/v2/tickers/E2E.SEC")
    ).json();
    expect(ticker).toMatchObject({
      symbol: "E2E.SEC",
      stock_exchange: { mic: "XNAS" },
      isin: "US0000000000",
    });
    const missing = await (
      await fetch("https://api.marketstack.com/v2/tickers/E2E.ISIN.EMPTY")
    ).json();
    expect(missing.isin).toBeNull();
    expect(
      (await fetch("https://api.marketstack.com/v2/tickers/E2E.PARTIAL"))
        .status,
    ).toBe(503);
    expect(
      (await fetch("https://api.marketstack.com/v2/tickers/UNMATCHED")).status,
    ).toBe(404);
  });

  it("bypasses unrelated HTTP requests", async () => {
    const server = createServer((_request, response) => {
      response.end("local response");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      enableMocks();
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a local TCP address");
      }
      const response = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(await response.text()).toBe("local response");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
  });
});
