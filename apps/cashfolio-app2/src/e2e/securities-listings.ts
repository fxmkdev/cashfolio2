/** Deterministic provider responses used only by the build-gated E2E runtime. */
export const e2eSecuritiesListings = [
  {
    ticker: "E2E.ISIN.EMPTY",
    name: "E2E Missing ISIN",
    stock_exchange: { name: "NASDAQ", mic: "XNAS", country: "US" },
    has_eod: false,
  },
  {
    ticker: "E2E.PARTIAL",
    name: "E2E Partial History ETF",
    stock_exchange: { name: "SIX Swiss Exchange", mic: "XSWX", country: "CH" },
    has_eod: true,
  },
  {
    ticker: "E2E.SEC",
    name: "E2E Example Security",
    stock_exchange: { name: "NASDAQ", mic: "XNAS", country: "US" },
    has_eod: true,
  },
  {
    ticker: "E2E.SEC",
    name: "E2E Example Security",
    stock_exchange: { name: "SIX Swiss Exchange", mic: "XSWX", country: "CH" },
    has_eod: null,
  },
  ...Array.from({ length: 24 }, (_, index) => ({
    ticker: `E2E.PAGE.${index + 1}`,
    name: `E2E Pagination Security ${index + 1}`,
    stock_exchange: { name: "NASDAQ", mic: "XNAS", country: "US" },
    has_eod: true,
  })),
];
