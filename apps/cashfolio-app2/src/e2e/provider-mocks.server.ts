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

function requestedCodes(url: URL, param: string) {
  return (url.searchParams.get(param) ?? "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}
function historyDays(url: URL) {
  let date = Temporal.PlainDate.from(
    url.searchParams.get("start_date") ?? url.searchParams.get("date_from")!,
  );
  const end = Temporal.PlainDate.from(
    url.searchParams.get("end_date") ?? url.searchParams.get("date_to")!,
  );
  const days: string[] = [];
  while (Temporal.PlainDate.compare(date, end) <= 0 && days.length <= 365) {
    days.push(date.toString());
    date = date.add({ days: 1 });
  }
  return days;
}
function fxHistory(request: Request, crypto: boolean) {
  const url = new URL(request.url),
    days = historyDays(url);
  const prices = crypto
    ? USD_PER_CRYPTO_RATE_BY_SYMBOL
    : USD_TO_CURRENCY_RATE_BY_SYMBOL;
  const codes = requestedCodes(url, crypto ? "symbols" : "currencies");
  return HttpResponse.json({
    success: true,
    timeframe: true,
    start_date: days[0],
    end_date: days.at(-1),
    [crypto ? "target" : "source"]: "USD",
    [crypto ? "rates" : "quotes"]: Object.fromEntries(
      days.map((date) => [
        date,
        Object.fromEntries(
          codes
            .filter((code) => prices[code] !== undefined)
            .map((code) => [crypto ? code : `USD${code}`, prices[code]]),
        ),
      ]),
    ),
  });
}

const e2eValuationProviderServer = setupServer(
  http.get("https://api.currencylayer.com/timeframe", ({ request }) =>
    fxHistory(request, false),
  ),
  http.get("https://api.coinlayer.com/timeframe", ({ request }) =>
    fxHistory(request, true),
  ),
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
    if (new URL(request.url).searchParams.has("exchange")) {
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
    }
    const url = new URL(request.url),
      codes = requestedCodes(url, "symbols");
    const data = historyDays(url).flatMap((date) =>
      codes.flatMap((symbol) => {
        const close = getE2ESecurityPrice(symbol, date);
        return close == null ? [] : [{ symbol, date, close }];
      }),
    );
    const offset = Number(url.searchParams.get("offset") ?? 0),
      limit = Number(url.searchParams.get("limit") ?? 1000);
    const page = data.slice(offset, offset + limit);
    return HttpResponse.json({
      pagination: { offset, total: data.length, count: page.length, limit },
      data: page,
    });
  }),
  http.get("https://api.currencylayer.com/historical", ({ request }) => {
    const url = new URL(request.url);
    const targetCurrency =
      url.searchParams.get("currencies")?.trim().toUpperCase() ?? "";
    const codes = requestedCodes(url, "currencies");
    if (codes.length > 1)
      return HttpResponse.json({
        success: true,
        quotes: Object.fromEntries(
          codes
            .filter(
              (code) => USD_TO_CURRENCY_RATE_BY_SYMBOL[code] !== undefined,
            )
            .map((code) => [
              `USD${code}`,
              USD_TO_CURRENCY_RATE_BY_SYMBOL[code],
            ]),
        ),
      });
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
    const codes = requestedCodes(url, "symbols");
    if (codes.length > 1)
      return HttpResponse.json({
        success: true,
        rates: Object.fromEntries(
          codes
            .filter((code) => USD_PER_CRYPTO_RATE_BY_SYMBOL[code] !== undefined)
            .map((code) => [code, USD_PER_CRYPTO_RATE_BY_SYMBOL[code]]),
        ),
      });
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
      if (url.searchParams.has("limit")) {
        const data = requestedCodes(url, "symbols").flatMap((symbol) => {
          const close = getE2ESecurityPrice(symbol, String(params.date));
          return close == null
            ? []
            : [{ symbol, date: String(params.date), close }];
        });
        return HttpResponse.json({
          pagination: { offset: 0, total: data.length, count: data.length },
          data,
        });
      }
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
