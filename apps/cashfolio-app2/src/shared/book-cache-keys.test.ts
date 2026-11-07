import { expect, it } from "vitest";
import {
  getAccountGainLossCacheEntryKey,
  getAccountGainLossBasisCacheEntryKey,
  getPeriodBaseCacheEntryKey,
  getPeriodBaseCacheIndexKey,
  getPeriodCacheGenerationKey,
  getHistoryMetricsCacheEntryKey,
} from "./book-cache-keys";

const scope = {
  cacheEnv: "local",
  accountBookId: "book-1",
  generation: "revision-1",
};

it("preserves deployed cache key formats and versions", () => {
  expect(
    getAccountGainLossBasisCacheEntryKey({ ...scope, watermark: "empty" }),
  ).toBe("account:gain-loss-basis:v4:local:book-1:revision-1:empty");
  expect(
    getAccountGainLossCacheEntryKey({
      ...scope,
      asOfDate: "2026-05-11",
      latestFetchableDate: "2026-05-10",
    }),
  ).toBe("account:gain-loss:v5:local:book-1:revision-1:2026-05-11:2026-05-10");
  expect(
    getPeriodBaseCacheEntryKey({ ...scope, periodCacheKey: "2026-01" }),
  ).toBe("period:base:v12:local:book-1:revision-1:2026-01");
  expect(getPeriodBaseCacheIndexKey(scope)).toBe(
    "period:base:index:v12:local:book-1:revision-1",
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
    "period:history:metrics:v15:local:book-1:revision-1:2026-01:cashFlow:account:asset-1",
  );
});
