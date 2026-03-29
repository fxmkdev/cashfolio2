import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const USD_TO_CURRENCY_RATE_BY_SYMBOL: Record<string, number> = {
  USD: 1,
  CHF: 0.5,
  EUR: 1.1,
};

const USD_PER_CRYPTO_RATE_BY_SYMBOL: Record<string, number> = {
  BTC: 200,
  ETH: 100,
};

const SECURITY_PRICE_BY_SYMBOL: Record<string, number> = {
  AAPL: 10,
  MSFT: 12,
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
  http.get("https://api.marketstack.com/v2/eod/:date", ({ request }) => {
    const url = new URL(request.url);
    const symbol = url.searchParams.get("symbols")?.trim().toUpperCase() ?? "";
    const price = SECURITY_PRICE_BY_SYMBOL[symbol];

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
  }),
);

let hasStartedE2EValuationProviderMocks = false;

export function ensureE2EValuationProviderMocksEnabled(): void {
  if (process.env.E2E_TEST_MODE !== "true") {
    return;
  }

  if (hasStartedE2EValuationProviderMocks) {
    return;
  }

  e2eValuationProviderServer.listen({
    onUnhandledRequest(request) {
      enforceHandledValuationProviderRequests(request);
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
