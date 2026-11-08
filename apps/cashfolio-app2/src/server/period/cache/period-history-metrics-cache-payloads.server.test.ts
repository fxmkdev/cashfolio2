import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toMoney } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
import { encodeMoneyCache } from "../../money-cache-codec";
import {
  cleanupHistoryMetricsCache,
  createMetrics,
  getOrLoadPeriodHistoryPointMetrics,
  loadPeriodHistoryPointMetricsWithCacheability,
  redisClient,
  redisState,
  resetHistoryMetricsCache,
} from "./period-history-metrics-cache.server.test-support";

describe("period history metrics cache", () => {
  beforeEach(resetHistoryMetricsCache);
  afterEach(cleanupHistoryMetricsCache);

  it("reloads oversized metrics before parsing even if their structure is valid", async () => {
    const input = { accountBookId: "book-1", period: "2026-04" };
    await getOrLoadPeriodHistoryPointMetrics(input);
    const key = redisClient.setEx.mock.calls[0]![0];
    redisState.kv.set(
      key,
      JSON.stringify(
        encodeMoneyCache({ ...createMetrics(), extra: "x".repeat(512 * 1024) }),
      ),
    );
    await getOrLoadPeriodHistoryPointMetrics(input);
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      2,
    );
  });

  it("rejects cached payloads missing Net Worth scope metadata", async () => {
    const metrics = createMetrics();
    const { netWorth: _netWorth, ...oldScopeOptions } = metrics.scopeOptions;
    redisState.kv.set(
      "period:history:metrics:v15:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(
        encodeMoneyCache({
          ...metrics,
          income: toMoney(999),
          scopeOptions: { ...oldScopeOptions, assets: [], liabilities: [] },
        }),
      ),
    );
    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });
    expect(result.income.toString()).toBe("12");
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
  });

  it.each(["v6", "v7", "v8", "v9", "v10", "v11", "v12", "v13"])(
    "ignores %s metrics from earlier calculations",
    async (version) => {
      const oldKey = `period:history:metrics:${version}:preview-app-123:book-1:gen-1:2026-04:total`;
      redisState.kv.set(
        oldKey,
        JSON.stringify(
          encodeMoneyCache(createMetrics({ gainsLosses: toMoney(999) })),
        ),
      );
      const result = await getOrLoadPeriodHistoryPointMetrics({
        accountBookId: "book-1",
        period: "2026-04",
      });
      expect(result.gainsLosses.toString()).toBe("2");
      expect(
        loadPeriodHistoryPointMetricsWithCacheability,
      ).toHaveBeenCalledTimes(1);
      expect(redisClient.get).toHaveBeenCalledWith(
        "period:history:metrics:v15:preview-app-123:book-1:gen-1:2026-04:total",
      );
      expect(redisState.kv.has(oldKey)).toBe(true);
    },
  );

  it("ignores v14 scopes with the old reporting label while preserving their identity", async () => {
    const scope = "gain-loss-investment:EQUITIES:managed-portfolios";
    const metricsWithLabel = (label: string) =>
      createMetrics({
        scopeOptions: {
          ...createMetrics().scopeOptions,
          gainsLosses: [
            { value: scope, label, kind: "gainLoss", grouping: "assetClass" },
          ],
        },
      });
    redisState.kv.set(
      "period:history:metrics:v14:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(encodeMoneyCache(metricsWithLabel("Managed Portfolios"))),
    );
    const freshMetrics = metricsWithLabel("Total Value Accounts");
    loadPeriodHistoryPointMetricsWithCacheability.mockResolvedValue({
      metrics: freshMetrics,
      cacheableFromPermanentValuationCache: true,
    });

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(toNumericMoney(result)).toEqual(toNumericMoney(freshMetrics));
    expect(
      loadPeriodHistoryPointMetricsWithCacheability,
    ).toHaveBeenCalledOnce();
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:history:metrics:v15:preview-app-123:book-1:gen-1:2026-04:total",
    );
  });

  it("ignores stale v1 history metrics entries", async () => {
    redisState.kv.set(
      "period:history:metrics:v1:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(createMetrics({ cashFlow: 0 })),
    );

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:history:metrics:v15:preview-app-123:book-1:gen-1:2026-04:total",
    );
  });

  it("ignores stale v2 history metrics entries computed from old base data", async () => {
    redisState.kv.set(
      "period:history:metrics:v2:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(createMetrics({ cashFlow: 0 })),
    );

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:history:metrics:v15:preview-app-123:book-1:gen-1:2026-04:total",
    );
  });

  it("ignores stale v3 history metrics entries computed before legacy cash fallback", async () => {
    redisState.kv.set(
      "period:history:metrics:v3:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(createMetrics({ cashFlow: 0 })),
    );

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:history:metrics:v15:preview-app-123:book-1:gen-1:2026-04:total",
    );
  });

  it("ignores stale v4 history metrics entries computed with legacy cash fallback", async () => {
    redisState.kv.set(
      "period:history:metrics:v4:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(createMetrics({ cashFlow: 50 })),
    );

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.get).toHaveBeenCalledWith(
      "period:history:metrics:v15:preview-app-123:book-1:gen-1:2026-04:total",
    );
  });

  it("ignores legacy entries missing balance scope options", async () => {
    redisState.kv.set(
      "period:history:metrics:v15:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify({
        totalReturn: toMoney(1),
        savings: toMoney(1),
        cashFlow: toMoney(1),
        income: toMoney(1),
        expenses: toMoney(1),
        gainsLosses: toMoney(1),
        assets: toMoney(1),
        liabilities: toMoney(1),
        netWorth: toMoney(1),
        scopeOptions: {
          cashFlow: [],
          income: [],
          expenses: [],
          gainsLosses: [],
        },
      }),
    );

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
  });

  it("ignores legacy entries missing cash flow", async () => {
    const legacyMetrics: Partial<ReturnType<typeof createMetrics>> = {
      ...createMetrics(),
    };
    delete legacyMetrics.cashFlow;
    redisState.kv.set(
      "period:history:metrics:v15:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(legacyMetrics),
    );

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
  });

  it("ignores malformed cached scope option arrays", async () => {
    redisState.kv.set(
      "period:history:metrics:v15:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(
        createMetrics({
          scopeOptions: {
            cashFlow: [],
            income: [{ value: "income-a", label: "Income A", kind: "account" }],
            expenses: [],
            gainsLosses: [
              { value: "unit-type:fx", label: "FX", kind: "gainLoss" },
            ],
            netWorth: [],
          },
        }),
      ),
    );

    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });

    expect(toNumericMoney(result)).toEqual(toNumericMoney(createMetrics()));
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
  });

  it.each(["accountStructure", "assetClass", "unknown"])(
    "validates cached grouping metadata %s",
    async (grouping) => {
      redisState.kv.set(
        "period:history:metrics:v15:preview-app-123:book-1:gen-1:2026-04:total",
        JSON.stringify(
          encodeMoneyCache(
            createMetrics({
              scopeOptions: {
                ...createMetrics().scopeOptions,
                gainsLosses: [
                  {
                    value:
                      grouping === "assetClass"
                        ? "gain-loss-account:portfolio"
                        : "account:portfolio",
                    label: "Portfolio",
                    kind: "gainLoss",
                    accountId: "portfolio",
                    grouping,
                  },
                ],
              },
            }),
          ),
        ),
      );
      const result = await getOrLoadPeriodHistoryPointMetrics({
        accountBookId: "book-1",
        period: "2026-04",
      });
      if (grouping === "unknown") {
        expect(
          loadPeriodHistoryPointMetricsWithCacheability,
        ).toHaveBeenCalledOnce();
        expect(result.scopeOptions.gainsLosses).toEqual([]);
      } else {
        expect(
          loadPeriodHistoryPointMetricsWithCacheability,
        ).not.toHaveBeenCalled();
        expect(result.scopeOptions.gainsLosses[0].grouping).toBe(grouping);
      }
    },
  );

  it("round-trips exact metric values on cold and warm cache reads", async () => {
    const exact = "12345678901234567890.123456789123456789";
    loadPeriodHistoryPointMetricsWithCacheability.mockResolvedValue({
      metrics: createMetrics({ assets: toMoney(exact) }),
      cacheableFromPermanentValuationCache: true,
    });
    const input = { accountBookId: "book-1", period: "2026-04" };
    const cold = await getOrLoadPeriodHistoryPointMetrics(input);
    const warm = await getOrLoadPeriodHistoryPointMetrics(input);
    expect(warm).toEqual(cold);
    expect(warm.assets.toString()).toBe(exact);
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
  });

  it("ignores numeric v5 metrics and treats invalid current decimal tags as misses", async () => {
    redisState.kv.set(
      "period:history:metrics:v5:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify(createMetrics()),
    );
    redisState.kv.set(
      "period:history:metrics:v15:preview-app-123:book-1:gen-1:2026-04:total",
      JSON.stringify({ totalReturn: { __cashfolioDecimal: "NaN" } }),
    );
    const result = await getOrLoadPeriodHistoryPointMetrics({
      accountBookId: "book-1",
      period: "2026-04",
    });
    expect(result.totalReturn.toString()).toBe("10");
    expect(loadPeriodHistoryPointMetricsWithCacheability).toHaveBeenCalledTimes(
      1,
    );
    expect(redisClient.setEx).toHaveBeenCalledTimes(1);
  });
});
