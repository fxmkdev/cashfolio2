import type { PriceRange } from "./contracts";

export type SecurityIdentity = { symbol: string; mic: string | null };
export type SecuritiesRouteSearch = {
  q?: string;
  exchange?: string;
  page?: number;
  selectedSymbol?: string;
  selectedMic?: string;
  range?: PriceRange;
};
export function isExchangeMic(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(value);
}
export function isSecuritySymbol(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 64 &&
    !value.includes(",") &&
    ![...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  );
}
/** URL identities are locators only. Provider data must issue a new signed reference. */
export function readSecuritiesRouteSearch(
  raw: Record<string, unknown>,
): SecuritiesRouteSearch {
  if (typeof raw.q !== "string" || raw.q.length > 255) return {};
  const result: SecuritiesRouteSearch = { q: raw.q.trim() };
  if (isExchangeMic(raw.exchange)) result.exchange = raw.exchange;
  const page = typeof raw.page === "string" ? Number(raw.page) : raw.page;
  if (
    typeof page === "number" &&
    Number.isSafeInteger(page) &&
    page > 1 &&
    page <= 107374183
  )
    result.page = page;
  if (
    isSecuritySymbol(raw.selectedSymbol) &&
    (raw.selectedMic === undefined || isExchangeMic(raw.selectedMic))
  ) {
    result.selectedSymbol = raw.selectedSymbol;
    if (isExchangeMic(raw.selectedMic)) result.selectedMic = raw.selectedMic;
    if (
      typeof raw.range === "string" &&
      ["1M", "6M", "1Y", "5Y"].includes(raw.range) &&
      raw.range !== "1Y"
    )
      result.range = raw.range as PriceRange;
  }
  return result;
}
export function selectedIdentity(
  view: SecuritiesRouteSearch,
): SecurityIdentity | null {
  return view.selectedSymbol === undefined
    ? null
    : {
        symbol: view.selectedSymbol,
        mic: view.selectedMic ?? null,
      };
}
export function identityKey(identity: SecurityIdentity | null): string {
  return JSON.stringify(identity && [identity.symbol, identity.mic]);
}
