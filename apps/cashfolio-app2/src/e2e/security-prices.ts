const DEFAULT_PRICES: Record<string, number> = { AAPL: 10, MSFT: 12 };

// Execution quotes for the staging E2E fixture generated as of 2026-10-10.
// Matching its recorded trade prices avoids artificial multi-holding residuals.
const STAGING_EXECUTION_PRICES: Record<string, Record<string, number>> = {
  "2023-12-09": { AAPL: 150, MSFT: 400 },
  "2023-12-10": { AAPL: 100 },
  "2024-02-07": { AAPL: 180, MSFT: 350 },
  "2024-02-08": { AAPL: 120 },
};

export function getE2ESecurityPrice(
  symbol: string,
  day: string,
): number | undefined {
  return STAGING_EXECUTION_PRICES[day]?.[symbol] ?? DEFAULT_PRICES[symbol];
}
