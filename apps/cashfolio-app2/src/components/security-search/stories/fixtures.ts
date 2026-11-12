import { Temporal } from "@/shared/temporal";
import type { PricePoint, PriceRange, SecurityListing } from "../types";

// Illustrative listings only: these symbols, MIC combinations and prices do not
// assert Marketstack coverage. Keep all fixtures out of production imports.
const exchanges = [
  {
    exchange: "NASDAQ",
    mic: "XNAS",
    country: "United States",
    currency: "USD",
  },
  {
    exchange: "SIX Swiss Exchange",
    mic: "XSWX",
    country: "Switzerland",
    currency: "CHF",
  },
  { exchange: "Xetra", mic: "XETR", country: "Germany", currency: "EUR" },
  {
    exchange: "London Stock Exchange",
    mic: "XLON",
    country: "United Kingdom",
    currency: "GBP",
  },
];

const instruments = [
  ["ALP", "Alpine Technologies", "Stock"],
  ["ALPN", "Alpine Technology Holdings", "Stock"],
  ["HBR", "Harbor Global Equity ETF", "ETF"],
  ["CED", "Cedar Energy", "Stock"],
  [
    "RIV",
    "River Sustainable Infrastructure and Emerging Markets Investment Fund",
    "ETF",
  ],
  ["ORC", "Orchard Healthcare", "Stock"],
  ["NVA", "Nova Communications", "Stock"],
] as const;

export const listings: SecurityListing[] = instruments.flatMap(
  ([symbol, name, securityType]) =>
    exchanges.map((exchange) => ({
      id: `${symbol}:${exchange.mic}`,
      symbol,
      name,
      securityType,
      ...exchange,
      hasHistory: true,
    })),
);

listings.push(
  {
    id: "ARCH:XNAS",
    symbol: "ARCH",
    name: "Archive Industries",
    ...exchanges[0]!,
    securityType: "Stock",
    hasHistory: false,
  },
  {
    id: "MYST:XLON",
    symbol: "MYST",
    name: "Mystery Capital",
    ...exchanges[3]!,
    currency: null,
    securityType: null,
    hasHistory: true,
  },
  {
    id: "OLD:unknown",
    symbol: "OLD",
    name: "Old World Holdings",
    exchange: null,
    mic: null,
    country: null,
    currency: null,
    securityType: null,
    hasHistory: false,
  },
);

export const exchangeOptions = exchanges.map(({ mic, exchange }) => ({
  value: mic,
  label: `${exchange} (${mic})`,
}));

const end = Temporal.PlainDate.from("2026-10-30");
const start = end.subtract({ years: 5 });

export function createPriceHistory(listing: SecurityListing): PricePoint[] {
  if (!listing.hasHistory) return [];
  const seed = [...listing.id].reduce(
    (total, letter) => total + letter.charCodeAt(0),
    0,
  );
  const points: PricePoint[] = [];
  let date = start;
  let index = 0;
  while (Temporal.PlainDate.compare(date, end) <= 0) {
    if (date.dayOfWeek <= 5) {
      points.push({
        date: date.toString(),
        close: Number(
          (
            35 +
            (seed % 90) +
            index * 0.025 +
            Math.sin(index / 23) * 7 +
            Math.cos(index / 7) * 2
          ).toFixed(2),
        ),
      });
      index++;
    }
    date = date.add({ days: 1 });
  }
  return points;
}

export function pricesForRange(
  points: PricePoint[],
  range: PriceRange,
): PricePoint[] {
  const duration = {
    "1M": { months: 1 },
    "6M": { months: 6 },
    "1Y": { years: 1 },
    "5Y": { years: 5 },
  }[range];
  const from = end.subtract(duration).toString();
  return points.filter((point) => point.date >= from);
}
