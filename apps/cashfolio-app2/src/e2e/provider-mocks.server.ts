import { HttpNetworkFrame } from "msw/experimental";
import { http, HttpResponse } from "msw/http";
import { setupServer } from "msw/node";
import { Temporal } from "../shared/temporal";
import { getE2ESecurityPrice } from "./security-prices";

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
  http.get("https://api.marketstack.com/v2/eod", ({ request }) => {
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
