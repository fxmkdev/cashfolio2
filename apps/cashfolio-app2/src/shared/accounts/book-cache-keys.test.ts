import { expect, it } from "vitest";
import {
  getAccountGainLossCacheEntryKey,
  getAccountReturnCacheEntryKey,
  getAccountReturnWorkKey,
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

it("keeps return summary and temporary work versions app-owned", () => {
  expect(
    getAccountReturnCacheEntryKey({
      ...scope,
      asOfDate: "2026-05-11",
      latestFetchableDate: "2026-05-10",
      scopeKey: "accountStructure:all",
    }),
  ).toBe(
    "account:returns:v4:local:book-1:revision-1:2026-05-11:2026-05-10:accountStructure:all",
  );
  expect(
    getAccountReturnWorkKey({ ...scope, userId: "user-1", id: "work-1" }),
  ).toBe("account:returns-work:v4:local:book-1:user-1:work-1");
});
