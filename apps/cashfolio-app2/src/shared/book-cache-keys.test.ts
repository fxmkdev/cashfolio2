import { describe, expect, it } from "vitest";
import {
  getAccountGainLossCacheEntryKey,
  getAccountGainLossBasisCacheEntryKey,
  getPeriodBaseCacheEntryKey,
  getPeriodBaseCacheIndexKey,
  getPeriodCacheGenerationKey,
  getHistoryMetricsCacheEntryKey,
  getBookScopedRedisKeyPatterns,
  isBookScopedPeriodCacheKey,
  getRestoreBookCacheKeyPatterns,
} from "./book-cache-keys";

const scope = {
  cacheEnv: "local",
  accountBookId: "book-1",
  generation: "revision-1",
};

function matches(pattern: string, key: string) {
  const regex = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${regex}$`).test(key);
}

const fixtureKeys = [
  ...["v1", "v2", "v3", "v6", "v7", "v8", "v99"].flatMap((version) => [
    `period:base:${version}:local:book-1:revision:2026-01`,
    `period:base:index:${version}:preview:book-1:revision`,
    `period:base:generation:${version}:local:book-1`,
    `period:history:metrics:${version}:preview:book-1:revision:2026-01:total`,
    `account:gain-loss:${version}:preview:book-1:revision:2026-05-11:2026-05-10`,
    `account:gain-loss-basis:${version}:preview:book-1:revision:2026-05-10`,
  ]),
];
const otherBookKeys = fixtureKeys.map((key) =>
  key.replace("book-1", "book-10"),
);
const preservedKeys = [
  "valuation:currencylayer:USD:CHF",
  "valuation:coinlayer:fallback:USD:BTC:123",
  "valuation:marketstack:TEST:USD",
  "valuation:miss-cooldown:test:123",
  "session:user-1",
  "period:unrelated:book-1",
];

it("preserves deployed cache key formats and versions", () => {
  expect(
    getAccountGainLossBasisCacheEntryKey({ ...scope, watermark: "empty" }),
  ).toBe("account:gain-loss-basis:v3:local:book-1:revision-1:empty");
  expect(
    getAccountGainLossCacheEntryKey({
      ...scope,
      asOfDate: "2026-05-11",
      latestFetchableDate: "2026-05-10",
    }),
  ).toBe("account:gain-loss:v4:local:book-1:revision-1:2026-05-11:2026-05-10");
  expect(
    getPeriodBaseCacheEntryKey({ ...scope, periodCacheKey: "2026-01" }),
  ).toBe("period:base:v10:local:book-1:revision-1:2026-01");
  expect(getPeriodBaseCacheIndexKey(scope)).toBe(
    "period:base:index:v10:local:book-1:revision-1",
  );
  expect(getPeriodCacheGenerationKey(scope)).toBe(
    "period:base:generation:v1:local:book-1",
  );
  expect(
    getHistoryMetricsCacheEntryKey({
      ...scope,
      periodCacheKey: "2026-01",
      scopeKey: "cashFlow:account:asset-1",
    }),
  ).toBe(
    "period:history:metrics:v12:local:book-1:revision-1:2026-01:cashFlow:account:asset-1",
  );
});

describe("cleanup namespace ownership", () => {
  it("matches every period-cache version and environment for only one book", () => {
    const patterns = getBookScopedRedisKeyPatterns("book-1");
    for (const key of fixtureKeys)
      expect(patterns.some((p) => matches(p, key))).toBe(true);
    for (const key of [...otherBookKeys, ...preservedKeys])
      expect(patterns.some((p) => matches(p, key))).toBe(false);
  });
  it("covers all books and legacy keys during restore, preserving global keys", () => {
    const patterns = getRestoreBookCacheKeyPatterns();
    for (const key of [
      ...fixtureKeys,
      ...otherBookKeys,
      "account-book:old-book:balance",
    ])
      expect(patterns.some((p) => matches(p, key))).toBe(true);
    for (const key of preservedKeys)
      expect(patterns.some((p) => matches(p, key))).toBe(false);
  });
  it("verifies book ownership even when a scope suffix contains another book ID", () => {
    for (const key of fixtureKeys)
      expect(isBookScopedPeriodCacheKey(key, "book-1")).toBe(true);
    for (const key of [...otherBookKeys, ...preservedKeys])
      expect(isBookScopedPeriodCacheKey(key, "book-1")).toBe(false);
    expect(
      isBookScopedPeriodCacheKey(
        "period:history:metrics:v12:local:book-2:revision:2026-01:scope:book-1:child",
        "book-1",
      ),
    ).toBe(false);
  });
  it("checks ownership for G/L suffixes containing another book ID", () => {
    expect(
      isBookScopedPeriodCacheKey(
        "account:gain-loss:v4:local:book-2:revision:book-1:2026-05-10",
        "book-1",
      ),
    ).toBe(false);
  });
  it("escapes Redis glob characters in literal account-book IDs", () => {
    expect(getBookScopedRedisKeyPatterns("book[*]?\\1")[0]).toBe(
      "period:base:v*:*:book\\[\\*\\]\\?\\\\1:*",
    );
  });
});
