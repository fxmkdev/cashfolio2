import { HttpNetworkFrame } from "msw/experimental";
import { http, HttpResponse } from "msw/http";
import { setupServer } from "msw/node";
import { Temporal } from "../shared/temporal";
import { getE2ESecurityPrice } from "./security-prices";
import { e2eSecuritiesListings } from "./securities-listings";

const USD_TO_CURRENCY_RATE_BY_SYMBOL: Record<string, number> = {
  USD: 1,
  CHF: 0.5,
  EUR: 1.1,
};

const USD_PER_CRYPTO_RATE_BY_SYMBOL: Record<string, number> = {
  BTC: 200,
  ETH: 100,
};

const E2E_VALUATION_PROVIDER_HOSTS = new Set([
  "api.currencylayer.com",
  "api.coinlayer.com",
  "api.marketstack.com",
]);

function enforceHandledValuationProviderRequests(request: Request): void {
  const host = new URL(request.url).host.toLowerCase();
  if (!E2E_VALUATION_PROVIDER_HOSTS.has(host)) {
    return;
  }

  throw new Error(
    `Unhandled E2E valuation provider request: ${request.method} ${request.url}`,
  );
}

const e2eValuationProviderServer = setupServer(
  http.get("https://api.marketstack.com/v2/tickers/:symbol", ({ params }) => {
    const symbol = String(params.symbol);
    if (symbol === "E2E.PARTIAL")
      return HttpResponse.json(
        { error: { code: "temporarily_unavailable" } },
        { status: 503 },
      );
    const row = e2eSecuritiesListings.find(
      (listing) => listing.ticker === symbol,
    );
    if (!row)
      return HttpResponse.json(
        { error: { code: "no_data_found" } },
        { status: 404 },
      );
    return HttpResponse.json({
      symbol,
      stock_exchange: row.stock_exchange,
      isin: symbol === "E2E.ISIN.EMPTY" ? null : "US0000000000",
    });
  }),
  http.get("https://api.marketstack.com/v2/tickerslist", ({ request }) => {
    const url = new URL(request.url);
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const exchange = url.searchParams.get("exchange");
    const rows = e2eSecuritiesListings.filter(
      (row) =>
        (!exchange || row.stock_exchange.mic === exchange) &&
        (row.ticker.toLowerCase().includes(search) ||
          row.name.toLowerCase().includes(search)),
    );
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const data = rows.slice(offset, offset + limit);
    return HttpResponse.json({
      data,
      pagination: { offset, limit, count: data.length, total: rows.length },
    });
  }),
  http.get("https://api.marketstack.com/v2/exchanges", ({ request }) => {
    const url = new URL(request.url);
    const rows = [
      { name: "NASDAQ", mic: "XNAS" },
      { name: "SIX Swiss Exchange", mic: "XSWX" },
    ];
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 1000);
    const data = rows.slice(offset, offset + limit);
    return HttpResponse.json({
      data,
      pagination: { offset, limit, count: data.length, total: rows.length },
    });
  }),
  http.get("https://api.marketstack.com/v2/eod", ({ request }) => {
    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbols");
    const mic = url.searchParams.get("exchange");
    if (
      !["E2E.SEC", "E2E.PARTIAL"].includes(symbol ?? "") ||
      !["XNAS", "XSWX"].includes(mic ?? "")
    )
      return HttpResponse.json({ error: { code: "no_data_found" } });
    const from = Temporal.PlainDate.from(url.searchParams.get("date_from")!);
    const through = url.searchParams.get("date_to")!;
    const rows = Array.from({ length: 61 }, (_, month) => ({
      date: from.add({ months: month }).toString(),
      close:
        symbol === "E2E.PARTIAL" && month === 58
          ? null
          : symbol === "E2E.PARTIAL" && month === 59
            ? 0
            : 100 + month,
      symbol,
      exchange: mic,
      price_currency: mic === "XSWX" ? "CHF" : "USD",
      asset_type: symbol === "E2E.PARTIAL" ? "ETF" : "Stock",
    })).filter((row) => row.date <= through);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 1000);
    const data = rows.slice(offset, offset + limit);
    return HttpResponse.json({
      data,
      pagination: { offset, limit, count: data.length, total: rows.length },
    });
  }),
  http.get("https://api.currencylayer.com/historical", ({ request }) => {
    const url = new URL(request.url);
    const targetCurrency =
      url.searchParams.get("currencies")?.trim().toUpperCase() ?? "";
    const quoteKey = `USD${targetCurrency}`;
    const rate = USD_TO_CURRENCY_RATE_BY_SYMBOL[targetCurrency];

    if (!targetCurrency || rate == null) {
      return HttpResponse.json({
        success: false,
        error: {
          code: 106,
          info: `No data available for ${targetCurrency || "UNKNOWN"}`,
        },
      });
    }

    return HttpResponse.json({
      success: true,
      quotes: {
        [quoteKey]: rate,
      },
    });
  }),
  http.get("https://api.coinlayer.com/:date", ({ request }) => {
    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbols")?.trim().toUpperCase() ?? "";
    const rate = USD_PER_CRYPTO_RATE_BY_SYMBOL[symbol];

    if (!symbol || rate == null) {
      return HttpResponse.json({
        success: false,
        error: {
          code: 106,
          info: `No data available for ${symbol || "UNKNOWN"}`,
        },
      });
    }

    return HttpResponse.json({
      success: true,
      rates: {
        [symbol]: rate,
      },
    });
  }),
  http.get(
    "https://api.marketstack.com/v2/eod/:date",
    ({ request, params }) => {
      const url = new URL(request.url);
      const symbol =
        url.searchParams.get("symbols")?.trim().toUpperCase() ?? "";
      const price = getE2ESecurityPrice(symbol, String(params.date));

      if (!symbol || price == null) {
        return HttpResponse.json({
          error: {
            message: "did not return any results",
          },
        });
      }

      // Intentionally omit quote-currency fields so tests can use one mocked
      // security price for multiple trade-currency account configurations.
      return HttpResponse.json({
        data: [{ close: price }],
      });
    },
  ),
);

let hasStartedE2EValuationProviderMocks = false;

export function ensureE2EValuationProviderMocksEnabled(): void {
  if (hasStartedE2EValuationProviderMocks) {
    return;
  }

  e2eValuationProviderServer.listen({
    onUnhandledFrame({ frame }) {
      if (frame instanceof HttpNetworkFrame) {
        enforceHandledValuationProviderRequests(frame.data.request);
      }
    },
  });
  hasStartedE2EValuationProviderMocks = true;

  process.once("exit", () => {
    e2eValuationProviderServer.close();
  });

  console.info("E2E valuation provider mocks enabled", {
    providers: ["currencylayer", "coinlayer", "marketstack"],
  });
}
