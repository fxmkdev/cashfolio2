import { expect, test } from "vitest";
import {
  identityKey,
  readSecuritiesRouteSearch,
  selectedIdentity,
} from "./route-search";

test("a bare URL is idle; explicit empty searches remain submitted and All Exchanges", () => {
  expect(readSecuritiesRouteSearch({})).toEqual({});
  expect(readSecuritiesRouteSearch({ q: "" })).toEqual({ q: "" });
  expect(readSecuritiesRouteSearch({ q: "  Apple  " })).toEqual({ q: "Apple" });
});
test("full browsing state round trips through URL parameters without tokens or metadata", () => {
  const view = {
    q: "",
    exchange: "XNAS",
    page: 3,
    selectedSymbol: " BRK B ",
    selectedMic: "XNAS",
    range: "5Y" as const,
  };
  const params = new URLSearchParams(
    Object.entries(view).map(([k, v]) => [k, String(v)]),
  );
  expect(readSecuritiesRouteSearch(Object.fromEntries(params))).toEqual(view);
  expect(selectedIdentity(view)).toEqual({ symbol: " BRK B ", mic: "XNAS" });
  expect(identityKey(selectedIdentity(view))).not.toBe(
    identityKey({ symbol: "BRKB", mic: "XNAS" }),
  );
});
test("untrusted URL values cannot introduce unsupported criteria or identities", () => {
  expect(
    readSecuritiesRouteSearch({ q: [], exchange: "XNAS", page: 2 }),
  ).toEqual({});
  expect(readSecuritiesRouteSearch({ q: "x".repeat(256) })).toEqual({});
  for (const page of [-1, 0, 1, 2.2, "x", Infinity, 107374184])
    expect(readSecuritiesRouteSearch({ q: "", page })).toEqual({ q: "" });
  for (const selectedSymbol of ["", " ", "A,B", "A\nB", "A".repeat(65)])
    expect(
      readSecuritiesRouteSearch({ q: "", selectedSymbol, range: "5Y" }),
    ).toEqual({ q: "" });
  expect(
    readSecuritiesRouteSearch({
      q: "",
      exchange: "../XNAS",
      selectedSymbol: "A",
      selectedMic: "?",
    }),
  ).toEqual({ q: "" });
  expect(
    readSecuritiesRouteSearch({
      q: "",
      page: 2,
      selectedSymbol: "A",
      range: "1Y",
      selectionToken: "secret",
      currency: "USD",
      sort: "name",
    }),
  ).toEqual({ q: "", page: 2, selectedSymbol: "A" });
  expect(selectedIdentity({ q: "", selectedSymbol: "A" })).toEqual({
    symbol: "A",
    mic: null,
  });
});
