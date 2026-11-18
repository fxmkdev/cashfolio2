import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Temporal } from "../../shared/temporal";
import { issueListing, resolveListing, listingId } from "./selection.server";
const listing = {
  name: "Example",
  symbol: "NEE 6.219",
  mic: "NMFQS",
  exchange: "Fund Exchange",
  country: null,
  hasHistory: null,
};
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-only-selection-key");
  vi.spyOn(Temporal.Now, "instant").mockReturnValue(
    Temporal.Instant.from("2026-11-18T12:00:00Z"),
  );
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Unexpected network request"),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
test("resolves trusted identity without database or network, preserving symbols and vendor MICs", () => {
  const result = issueListing(listing);
  expect(resolveListing(result.selectionToken)).toEqual(result);
  expect(result).toMatchObject({
    symbol: "NEE 6.219",
    mic: "NMFQS",
    currency: null,
  });
  expect(listingId(listing.symbol, "XETRA")).not.toBe(result.id);
  expect(listingId("NEE6.219", listing.mic)).not.toBe(result.id);
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
test("rejects tampering, malformed signatures, expiry and secret rotation", () => {
  const { selectionToken } = issueListing(listing);
  const [payload, signature] = selectionToken.split(".");
  const altered = Buffer.from(
    JSON.stringify({ v: 1, listing: { ...listing, mic: "XNAS" } }),
  ).toString("base64url");
  for (const token of [
    "",
    "bad",
    `${payload}.short`,
    `${payload}.${signature}.extra`,
    `${altered}.${signature}`,
    "x".repeat(4097),
  ])
    expect(() => resolveListing(token)).toThrow("Search again");
  vi.spyOn(Temporal.Now, "instant").mockReturnValue(
    Temporal.Instant.from("2026-11-19T12:00:00Z"),
  );
  expect(() => resolveListing(selectionToken)).toThrow("expired");
  vi.stubEnv("SESSION_SECRET", "rotated-key");
  expect(() => resolveListing(selectionToken)).toThrow("invalid");
});
test("validates signed payload version, bounds, expiry and listing metadata", () => {
  function sign(value: unknown) {
    const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
    const key = createHmac("sha256", "test-only-selection-key")
      .update("cashfolio:securities:selection:v1")
      .digest();
    return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
  }
  const base = { v: 1, listing, expiresAt: "2026-11-19T12:00:00Z" };
  for (const value of [
    null,
    { ...base, v: 2 },
    { ...base, expiresAt: "invalid" },
    { ...base, expiresAt: "2026-11-20T12:00:00Z" },
    ...[
      { symbol: "ABC,DEF" },
      { mic: "bad mic" },
      { hasHistory: "yes" },
      { name: 5 },
      { country: {} },
    ].map((change) => ({ ...base, listing: { ...listing, ...change } })),
  ])
    expect(() => resolveListing(sign(value))).toThrow("Search again");
});
test("does not issue references without server configuration", () => {
  vi.stubEnv("SESSION_SECRET", "");
  expect(() => issueListing(listing)).toThrow("not configured");
});
