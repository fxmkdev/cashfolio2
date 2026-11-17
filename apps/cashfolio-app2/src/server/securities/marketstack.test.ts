import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
const apiKey = vi.hoisted(() => vi.fn());
const record = vi.hoisted(() => vi.fn());
vi.mock("../valuation/provider-api-key.server", () => ({
  getProviderApiKey: apiKey,
}));
vi.mock("../valuation/provider-usage.server", () => ({
  recordValuationProviderRequest: record,
}));
import {
  fetchMarketstackPage,
  parseCatalogueRow,
  isCataloguePlaceholder,
  parseHistoryRows,
  parseMarketstackPage,
  fetchExchangeCountries,
} from "./marketstack.server";
const price = {
  symbol: "ABC",
  exchange: "XNAS",
  date: "2026-11-10T00:00:00+0000",
  close: 12.5,
  price_currency: "USD",
  asset_type: "Stock",
};
const page = (data: unknown[]) => ({
  data,
  pagination: { offset: 0, count: data.length, total: data.length },
});
beforeEach(() => {
  vi.clearAllMocks();
  apiKey.mockResolvedValue("secret-test-key");
  record.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("Marketstack Securities contract", () => {
  test("normalizes exact provider identity and preserves unknown metadata", () => {
    expect(
      parseCatalogueRow({
        ticker: "ABC.L",
        name: "ABC",
        stock_exchange: { name: "London", mic: "XLON" },
      }),
    ).toMatchObject({
      symbol: "ABC.L",
      mic: "XLON",
      exchangeLabel: "London (XLON)",
      country: null,
      hasHistory: null,
    });
    expect(parseCatalogueRow({ ticker: "ABC", has_eod: false })).toMatchObject({
      exchangeLabel: "Unknown",
      hasHistory: false,
    });
    for (const row of [
      { ticker: "ABC,DEF" },
      { ticker: "ABC", stock_exchange: { mic: "XNYS,XNAS" } },
      { ticker: "ABC", has_eod: "yes" },
    ])
      expect(() => parseCatalogueRow(row)).toThrow();
  });
  test("loads country codes from paginated exchange metadata without guessing countries", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          data: [{ mic: "XNAS", country: null, country_code: "US" }],
          pagination: { offset: 0, count: 1, total: 2 },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ mic: "XUNK", country: null, country_code: null }],
          pagination: { offset: 1, count: 1, total: 2 },
        }),
      );
    expect([...(await fetchExchangeCountries({}))]).toEqual([["XNAS", "US"]]);
    expect(record).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ requestReason: "CATALOGUE_REFRESH" }),
    );
  });
  test("represents a provider-confirmed no-data response as missing history", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ error: { code: "no_data_found" } }),
    );
    expect((await fetchMarketstackPage("eod", {})).data).toEqual([]);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "NO_DATA" }),
    );
  });
  test("preserves vendor exchange identifiers and unknown country placeholders", async () => {
    expect(
      parseCatalogueRow({
        ticker: "ABC",
        stock_exchange: { name: "Xetra", mic: "XETRA" },
      }),
    ).toMatchObject({ mic: "XETRA", exchangeLabel: "Xetra (XETRA)" });
    expect(
      parseCatalogueRow({ ticker: "ABC", stock_exchange: { mic: "NMFQS" } })
        .mic,
    ).toBe("NMFQS");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        data: [
          { mic: "XETRA", country: null, country_code: "DE" },
          { mic: "NMFQS", country: null, country_code: "US" },
          { mic: "INDX", country: null, country_code: "INDX" },
        ],
        pagination: { offset: 0, count: 3, total: 3 },
      }),
    );
    expect([...(await fetchExchangeCountries({}))]).toEqual([
      ["XETRA", "DE"],
      ["NMFQS", "US"],
    ]);
  });
  test("preserves spaces in provider symbols while rejecting delimiters and control characters", async () => {
    expect(
      parseCatalogueRow({
        ticker: "NEE 6.219",
        name: "NextEra Energy Inc",
        stock_exchange: { mic: "XNYS" },
      }).symbol,
    ).toBe("NEE 6.219");
    for (const ticker of ["ABC,DEF", "ABC\nDEF", "ABC\tDEF"])
      expect(() => parseCatalogueRow({ ticker })).toThrow("invalid symbol");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json(
          page([{ ...price, symbol: "NEE 6.219", exchange: "XNYS" }]),
        ),
      );
    await fetchMarketstackPage("eod", {
      symbols: "NEE 6.219",
      exchange: "XNYS",
      date_from: "2026-11-01",
      date_to: "2026-11-16",
    });
    const url = new URL(String(fetch.mock.calls[0]![0]));
    expect(url.searchParams.get("symbols")).toBe("NEE 6.219");
    expect(url.searchParams.get("exchange")).toBe("XNYS");
  });
  test("recognizes only nameless, symbolless TEST placeholders and preserves raw pagination", async () => {
    const placeholder = { name: null, stock_exchange: { mic: "TEST" } };
    expect(isCataloguePlaceholder(placeholder)).toBe(true);
    expect(
      isCataloguePlaceholder({
        ticker: "ABC",
        stock_exchange: { mic: "TEST" },
      }),
    ).toBe(false);
    expect(
      isCataloguePlaceholder({ name: null, stock_exchange: { mic: "XNYS" } }),
    ).toBe(false);
    expect(() =>
      parseCatalogueRow({ name: null, stock_exchange: { mic: "XNYS" } }),
    ).toThrow("invalid symbol");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json(page([placeholder, { ticker: "ABC", name: "ABC" }])),
    );
    const result = await fetchMarketstackPage("tickerslist", {});
    expect(result.data).toHaveLength(2);
    expect(result.pagination.count).toBe(2);
  });
  test("rejects inconsistent or malformed pagination", () => {
    expect(parseMarketstackPage(page([]), 0).pagination.total).toBe(0);
    for (const raw of [
      { data: [], pagination: { count: 1, offset: 0, total: 1 } },
      { data: [], pagination: { count: 0, offset: 1, total: 1 } },
      { data: [], pagination: { count: 0, offset: 0, total: -1 } },
      {},
    ])
      expect(() => parseMarketstackPage(raw, 0)).toThrow();
  });
  test("sorts unadjusted closes and rejects other exchanges, units and duplicates", () => {
    expect(
      parseHistoryRows(
        [price, { ...price, date: "2026-11-09", close: 10, adj_close: 99 }],
        "ABC",
        "XNAS",
        "2026-11-01",
        "2026-11-16",
      ),
    ).toEqual({
      currency: "USD",
      securityType: "Stock",
      points: [
        { date: "2026-11-09", close: 10 },
        { date: "2026-11-10", close: 12.5 },
      ],
    });
    for (const rows of [
      [{ ...price, exchange: "XLON" }],
      [price, price],
      [price, { ...price, date: "2026-11-09", price_currency: "GBp" }],
      [{ ...price, date: "2026-02-30" }],
      [{ ...price, close: NaN }],
    ])
      expect(() =>
        parseHistoryRows(rows, "ABC", "XNAS", "2026-11-01", "2026-11-16"),
      ).toThrow();
    expect(
      parseHistoryRows(
        [{ ...price, price_currency: null, asset_type: null }],
        "ABC",
        "XNAS",
        "2026-11-01",
        "2026-11-16",
      ),
    ).toMatchObject({ currency: null, securityType: null });
  });
  test("sends exact symbol and MIC and records each request without URLs or keys", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(page([price])));
    await fetchMarketstackPage("eod", { symbols: "ABC", exchange: "XNAS" });
    const url = new URL(String(fetch.mock.calls[0]![0]));
    expect(url.searchParams.get("exchange")).toBe("XNAS");
    expect(url.searchParams.get("symbols")).toBe("ABC");
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        requestReason: "SECURITY_HISTORY",
        outcome: "RETRIEVED",
        httpStatus: 200,
      }),
    );
    expect(JSON.stringify(record.mock.calls)).not.toContain("secret-test-key");
  });
  test("distinguishes configuration, entitlement, quota, malformed and transient failures", async () => {
    apiKey.mockResolvedValueOnce(null);
    await expect(fetchMarketstackPage("eod", {})).rejects.toThrow(
      "not configured",
    );
    const fetch = vi.spyOn(globalThis, "fetch");
    for (const [status, code, message] of [
      [403, 105, "subscription"],
      [200, 104, "quota"],
      [401, 101, "credentials"],
    ] as const) {
      fetch.mockResolvedValueOnce(
        Response.json({ error: { code } }, { status }),
      );
      await expect(fetchMarketstackPage("eod", {})).rejects.toThrow(message);
    }
    fetch.mockResolvedValueOnce(Response.json({ data: "bad" }));
    await expect(fetchMarketstackPage("eod", {})).rejects.toThrow("malformed");
    fetch.mockRejectedValue(new TypeError("network"));
    await expect(fetchMarketstackPage("eod", {})).rejects.toThrow(
      "could not be reached",
    );
  });
  test("retries a timed-out page with the exact same offset and records every attempt", async () => {
    vi.spyOn(AbortSignal, "timeout")
      .mockReturnValueOnce(
        AbortSignal.abort(new DOMException("timed out", "TimeoutError")),
      )
      .mockReturnValue(new AbortController().signal);
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new DOMException("aborted", "AbortError"))
      .mockResolvedValueOnce(
        Response.json({
          data: [],
          pagination: { offset: 1000, count: 0, total: 1000 },
        }),
      );
    await expect(
      fetchMarketstackPage("tickerslist", { offset: "1000" }),
    ).resolves.toMatchObject({ pagination: { offset: 1000 } });
    expect(
      fetch.mock.calls.map(([url]) =>
        new URL(String(url)).searchParams.get("offset"),
      ),
    ).toEqual(["1000", "1000"]);
    expect(
      record.mock.calls.map(([input]) => [
        input.outcome,
        input.retryCount,
        input.requestReason,
      ]),
    ).toEqual([
      ["TIMEOUT", 0, "CATALOGUE_REFRESH"],
      ["NO_DATA", 1, "CATALOGUE_REFRESH"],
    ]);
  });
  test("recovers from temporary HTTP and network failures without retrying malformed data", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(Response.json(page([])));
    await expect(fetchMarketstackPage("eod", {})).resolves.toMatchObject({
      data: [],
    });
    expect(record.mock.calls.map(([input]) => input.outcome)).toEqual([
      "HTTP_ERROR",
      "REQUEST_ERROR",
      "NO_DATA",
    ]);
    fetch.mockClear();
    fetch.mockResolvedValueOnce(Response.json({ data: "malformed" }));
    await expect(fetchMarketstackPage("tickerslist", {})).rejects.toThrow(
      "malformed",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test("bounds persistent timeouts and never retries an explicit cancellation", async () => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(
      AbortSignal.abort(new DOMException("timed out", "TimeoutError")),
    );
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(fetchMarketstackPage("eod", {})).rejects.toThrow("timed out");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(record).toHaveBeenCalledTimes(3);
    fetch.mockClear();
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(
      fetchMarketstackPage("eod", {}, { signal: controller.signal }),
    ).rejects.toThrow("cancelled");
    expect(fetch).not.toHaveBeenCalled();
  });
  test("bounds rate-limit retries and records them", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(Response.json(page([])));
    const pending = fetchMarketstackPage("tickerslist", {});
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ data: [] });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(record.mock.calls.map(([v]) => v.outcome)).toEqual([
      "RATE_LIMIT_RETRY",
      "NO_DATA",
    ]);
  });
});
