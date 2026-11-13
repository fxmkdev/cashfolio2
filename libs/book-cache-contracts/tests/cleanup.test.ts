import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getBookScopedRedisKeyPatterns,
  isBookScopedPeriodCacheKey,
  getRestoreBookCacheKeyPatterns,
} from "@cashfolio/book-cache-contracts";

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
    `account:returns-work:${version}:preview:book-1:user:work`,
    `account:returns:${version}:preview:book-1:revision:2026-05-11:2026-05-10:accountStructure:all`,
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

describe("cleanup namespace ownership", () => {
  it("matches every period-cache version and environment for only one book", () => {
    const patterns = getBookScopedRedisKeyPatterns("book-1");
    for (const key of fixtureKeys)
      assert.equal(
        patterns.some((p) => matches(p, key)),
        true,
      );
    for (const key of [...otherBookKeys, ...preservedKeys])
      assert.equal(
        patterns.some((p) => matches(p, key)),
        false,
      );
  });
  it("covers all books and legacy keys during restore, preserving global keys", () => {
    const patterns = getRestoreBookCacheKeyPatterns();
    for (const key of [
      ...fixtureKeys,
      ...otherBookKeys,
      "account-book:old-book:balance",
    ])
      assert.equal(
        patterns.some((p) => matches(p, key)),
        true,
      );
    for (const key of preservedKeys)
      assert.equal(
        patterns.some((p) => matches(p, key)),
        false,
      );
  });
  it("verifies book ownership even when a scope suffix contains another book ID", () => {
    for (const key of fixtureKeys)
      assert.equal(isBookScopedPeriodCacheKey(key, "book-1"), true);
    for (const key of [...otherBookKeys, ...preservedKeys])
      assert.equal(isBookScopedPeriodCacheKey(key, "book-1"), false);
    assert.equal(
      isBookScopedPeriodCacheKey(
        "period:history:metrics:v15:local:book-2:revision:2026-01:scope:book-1:child",
        "book-1",
      ),
      false,
    );
  });
  it("checks ownership for G/L suffixes containing another book ID", () => {
    assert.equal(
      isBookScopedPeriodCacheKey(
        "account:gain-loss:v5:local:book-2:revision:book-1:2026-05-10",
        "book-1",
      ),
      false,
    );
  });
  it("escapes Redis glob characters in literal account-book IDs", () => {
    assert.equal(
      getBookScopedRedisKeyPatterns("book[*]?\\1")[0],
      "period:base:v*:*:book\\[\\*\\]\\?\\\\1:*",
    );
  });
});
