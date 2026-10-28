import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ensureE2EValuationProviderMocksEnabled } from "./provider-mocks.server";

beforeAll(() => {
  vi.stubEnv("E2E_TEST_MODE", "true");
  ensureE2EValuationProviderMocksEnabled();
});
afterAll(() => vi.unstubAllEnvs());

it.each([
  [
    "https://api.currencylayer.com/historical?currencies=CHF",
    { success: true, quotes: { USDCHF: 0.5 } },
  ],
  [
    "https://api.coinlayer.com/2026-10-01?symbols=BTC",
    { success: true, rates: { BTC: 200 } },
  ],
  [
    "https://api.marketstack.com/v2/eod/2026-10-01?symbols=AAPL",
    { data: [{ close: 10 }] },
  ],
  [
    "https://api.marketstack.com/v2/eod/2023-12-10?symbols=AAPL",
    { data: [{ close: 100 }] },
  ],
])("intercepts %s with deterministic fixture prices", async (url, expected) => {
  await expect(fetch(url).then((response) => response.json())).resolves.toEqual(
    expected,
  );
});

it.each([
  "https://api.currencylayer.com/historical?currencies=UNKNOWN",
  "https://api.currencylayer.com/historical",
  "https://api.coinlayer.com/2026-10-01?symbols=UNKNOWN",
  "https://api.coinlayer.com/2026-10-01",
])("returns no-data for %s", async (url) => {
  await expect(
    fetch(url).then((response) => response.json()),
  ).resolves.toMatchObject({ success: false, error: { code: 106 } });
});

it.each([
  "https://api.marketstack.com/v2/eod/2026-10-01?symbols=UNKNOWN",
  "https://api.marketstack.com/v2/eod/2026-10-01",
])("returns no security price for %s", async (url) => {
  await expect(fetch(url).then((response) => response.json())).resolves.toEqual(
    { error: { message: "did not return any results" } },
  );
});
