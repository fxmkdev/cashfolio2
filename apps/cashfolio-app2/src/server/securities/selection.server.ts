import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Temporal } from "../../shared/temporal";
import type { SecurityListing } from "../../shared/securities/contracts";
import { parseListingRow, type ListingMetadata } from "./marketstack.server";

const DAY_SECONDS = 86400;
function signingKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret)
    throw new Error("Securities listing references are not configured.");
  return createHmac("sha256", secret)
    .update("cashfolio:securities:selection:v1")
    .digest();
}
export function listingId(symbol: string, mic: string | null) {
  return createHash("sha256")
    .update(JSON.stringify([symbol, mic]))
    .digest("base64url");
}
/** Reuse provider validation for metadata read from cache or a verified reference. */
export function readListingMetadata(value: unknown): ListingMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid listing metadata.");
  const row = value as Record<string, unknown>;
  if (
    typeof row.symbol !== "string" ||
    typeof row.name !== "string" ||
    !(row.mic === null || typeof row.mic === "string") ||
    !(row.exchange === null || typeof row.exchange === "string") ||
    !(row.country === null || typeof row.country === "string") ||
    !(row.hasHistory === null || typeof row.hasHistory === "boolean")
  )
    throw new Error("Invalid listing metadata.");
  return parseListingRow({
    ticker: row.symbol,
    name: row.name,
    stock_exchange: { name: row.exchange, mic: row.mic, country: row.country },
    has_eod: row.hasHistory,
  });
}
export function issueListing(listing: ListingMetadata): SecurityListing {
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      listing,
      expiresAt: Temporal.Now.instant()
        .add({ seconds: DAY_SECONDS })
        .toString(),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", signingKey())
    .update(payload)
    .digest("base64url");
  return {
    ...listing,
    id: listingId(listing.symbol, listing.mic),
    selectionToken: `${payload}.${signature}`,
    currency: null,
    securityType: null,
  };
}
export function resolveListing(token: string): SecurityListing {
  try {
    if (token.length > 4096) throw new Error();
    const [payload, signature, extra] = token.split(".");
    if (
      !payload ||
      !signature ||
      extra !== undefined ||
      !/^[A-Za-z0-9_-]+$/.test(signature)
    )
      throw new Error();
    const expected = createHmac("sha256", signingKey())
      .update(payload)
      .digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new Error();
    const value: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    const entry = value as Record<string, unknown>;
    if (entry.v !== 1 || typeof entry.expiresAt !== "string") throw new Error();
    const expiry = Temporal.Instant.from(entry.expiresAt);
    const now = Temporal.Now.instant();
    if (
      Temporal.Instant.compare(expiry, now) <= 0 ||
      Temporal.Instant.compare(expiry, now.add({ seconds: DAY_SECONDS })) > 0
    )
      throw new Error();
    const listing = readListingMetadata(entry.listing);
    return {
      ...listing,
      id: listingId(listing.symbol, listing.mic),
      selectionToken: token,
      currency: null,
      securityType: null,
    };
  } catch {
    throw new Error(
      "This listing reference is invalid or expired. Search again.",
    );
  }
}
