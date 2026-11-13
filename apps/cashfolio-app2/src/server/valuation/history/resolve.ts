import { toMoney } from "../../../shared/money";
import { MAX_BACKTRACK_DAYS } from "../constants";
import type { HistoryCoverage, HistorySnapshot, HistoryRate } from "./types";
const DAY = 86_400_000;
/** Cover every searched day; an isolated older quote cannot prove no newer quote exists. */
export function coveredUntil(
  coverage: HistoryCoverage[],
  from: number,
  to: number,
): number {
  if (from > to) return Infinity;
  let cursor = from;
  let validUntil = Infinity;
  while (cursor <= to) {
    const matches = coverage.filter(
      (c) => c.from <= cursor && c.to >= cursor && c.expiresAt > Date.now(),
    );
    if (!matches.length) return 0;
    const best = matches.sort(
      (a, b) => b.to - a.to || b.expiresAt - a.expiresAt,
    )[0]!;
    cursor = best.to + DAY;
    validUntil = Math.min(validUntil, best.expiresAt);
  }
  return validUntil;
}
export function resolveHistoricalRate(
  snapshot: HistorySnapshot,
  requested: number,
  cutoff: number,
): HistoryRate | undefined {
  const date = Math.min(requested, cutoff);
  let lo = 0;
  let hi = snapshot.points.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (snapshot.points[mid]!.timestamp <= date) lo = mid + 1;
    else hi = mid;
  }
  const quote = snapshot.points[lo - 1];
  if (quote && (quote.timestamp === date || quote.timestamp >= cutoff))
    return {
      rate: toMoney(quote.value),
      source: quote.validUntil ? "provider" : "timeSeries",
      validUntil: quote.validUntil ?? Infinity,
    };
  const coverage = snapshot.coverage.filter((c) => c.publication === cutoff);
  const explicitNoData = coverage.filter(
    (c) =>
      c.noData && c.from <= date && c.to >= date && c.expiresAt > Date.now(),
  );
  if (explicitNoData.length)
    return {
      rate: null,
      source: "missing",
      validUntil: Math.min(...explicitNoData.map((c) => c.expiresAt)),
    };
  const from = Math.max(
    date - MAX_BACKTRACK_DAYS * DAY,
    quote ? quote.timestamp + DAY : -Infinity,
  );
  const stableProof = coveredUntil(
    coverage.filter((c) => !c.temporary),
    from,
    date,
  );
  const proof = stableProof || coveredUntil(coverage, from, date);
  if (!proof) return;
  if (!quote) return { rate: null, source: "missing", validUntil: proof };
  return {
    rate: toMoney(quote.value),
    source: stableProof ? "covered" : "fallback",
    validUntil: Math.min(proof, quote.validUntil ?? Infinity),
  };
}
