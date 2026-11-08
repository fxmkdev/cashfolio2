import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toNumericMoney } from "../../money-boundary";
import {
  cleanupHistoryMetricsCache,
  createMetrics,
  getOrLoadPeriodHistoryPointMetrics,
  getRedisClient,
  redisClient,
  resetHistoryMetricsCache,
} from "./period-history-metrics-cache.server.test-support";

describe("period history metrics cache", () => {
  beforeEach(resetHistoryMetricsCache);
  afterEach(cleanupHistoryMetricsCache);

  it("computes uncached when redis is unavailable", async () => {
    getRedisClient.mockResolvedValueOnce(null);

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
    expect(redisClient.setEx).not.toHaveBeenCalled();
  });
});
