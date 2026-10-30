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
