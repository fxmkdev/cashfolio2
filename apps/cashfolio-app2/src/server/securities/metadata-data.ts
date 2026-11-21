export type TickerMetadata = {
  symbol: string;
  mic: string;
  isin: string | null;
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Marketstack returned malformed security metadata.");
  return value as Record<string, unknown>;
}
export function parseTickerMetadata(
  raw: unknown,
  symbol: string,
  mic: string,
): TickerMetadata {
  const row = record(raw);
  const exchange = record(row.stock_exchange);
  if (row.symbol !== symbol || exchange.mic !== mic)
    throw new Error("Marketstack returned metadata for a different listing.");
  if (row.isin == null) return { symbol, mic, isin: null };
  if (typeof row.isin !== "string")
    throw new Error("Marketstack returned an invalid ISIN.");
  const isin = row.isin.trim();
  if (isin && !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin))
    throw new Error("Marketstack returned an invalid ISIN.");
  return { symbol, mic, isin: isin || null };
}
export function readCachedMetadata(
  raw: unknown,
  symbol: string,
  mic: string,
): TickerMetadata {
  const row = record(raw);
  if (!("isin" in row)) throw new Error("Invalid cached security metadata.");
  return parseTickerMetadata(
    { symbol: row.symbol, stock_exchange: { mic: row.mic }, isin: row.isin },
    symbol,
    mic,
  );
}
