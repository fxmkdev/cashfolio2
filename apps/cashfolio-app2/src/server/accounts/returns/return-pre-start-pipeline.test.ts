import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Temporal } from "../../../shared/temporal";
import {
  emptyAccountReturnResult,
  type AccountReturnDetails,
  type AccountReturnSummaries,
} from "../../../shared/accounts/account-returns";
import type { HistoryTask } from "../../valuation/history/types";
import type { HistoryBatch } from "../../valuation/history/provider.server";
import { clearHistorySeries } from "../../valuation/history/cache.server";
import { account, booking } from "./return-test-support";
import type { ReturnInputs } from "./return-engine.server";
import { capitalRateRequests } from "./return-engine.server";
import { getReturnPlan } from "./return-plan.server";
import { queryAccountReturnWork } from "./account-returns.server";
import type { ReturnWorkArgs } from "./return-work-types";
import { returnArtifactId, returnArtifacts } from "./return-artifacts.server";

const mocks = vi.hoisted(() => ({
  inputs: vi.fn(),
  fetch: vi.fn<(task: HistoryTask) => Promise<HistoryBatch>>(),
  capability: vi.fn(),
}));
vi.mock("../../../redis.server", () => ({ getRedisClient: async () => null }));
vi.mock("./return-inputs.server", () => ({
  loadAccountReturnInputs: mocks.inputs,
}));
vi.mock("../../period/cache/period-cache.server", () => ({
  getPeriodCacheGeneration: async () => "revision",
  getPeriodCacheEnvOrThrowWhenRedisAvailable: () => "test",
  PERIOD_CACHE_TTL_SECONDS: 86400,
  formatUtcDateKey: (date: Date) => date.toISOString().slice(0, 10),
}));
vi.mock("../../valuation/history/provider.server", () => ({
  fetchHistory: mocks.fetch,
}));
vi.mock("../../valuation/history/capability.server", () => ({
  historyCapability: mocks.capability,
}));
let serial = 0;
let bookId: string;
let symbol: string;
let inputs: ReturnInputs;
const publication = "2026-01-03";
const scope = () => ({
  accountBookId: bookId,
  accountState: "all" as const,
  grouping: "accountStructure" as const,
});
const ledger = (includeDetails = false): ReturnWorkArgs => ({
  ...scope(),
  target: { kind: "account", id: "stock" },
  period: "2026-01",
  includeDetails,
});
function fixture(withFee: boolean): ReturnInputs {
  const stock = {
    unit: "SECURITY" as const,
    currency: null,
    symbol,
    tradeCurrency: "USD",
  };
  return {
    accounts: [account("stock", stock), account("eur", { currency: "EUR" })],
    groups: [
      { id: "group", name: "Investments", parentGroupId: null, isActive: true },
    ],
    classes: [
      { id: "equities", name: "Equities", parentId: null, sortOrder: 0 },
    ],
    transactions: [
      {
        bookings: [
          booking("stock-in", "2026-01-02", "1", {
            ...stock,
            accountId: "stock",
            transactionId: "purchase",
          }),
          booking("eur-out", "2025-12-31", withFee ? "-101" : "-100", {
            currency: "EUR",
            accountId: "eur",
            transactionId: "purchase",
          }),
          ...(withFee
            ? [
                booking("fee", "2026-01-02", "1", {
                  currency: "EUR",
                  accountId: "fee",
                  accountType: "EQUITY" as const,
                  equityAccountSubtype: "EXPENSE" as const,
                  transactionId: "purchase",
                }),
              ]
            : []),
        ],
      },
    ],
    initialBalances: new Map(),
    revision: "revision",
    referenceCurrency: "USD",
    startDate: "2026-01-01",
    asOfDate: "2026-01-04",
  };
}
async function complete(args: ReturnWorkArgs) {
  let continuation: string | undefined;
  for (let batch = 0; batch < 20; batch++) {
    const response = await queryAccountReturnWork(
      { ...args, continuation },
      "user",
    );
    if (response.status === "complete") return response.data;
    if (response.status === "restart") throw new Error("Unexpected restart");
    continuation = response.continuation;
  }
  throw new Error("Return did not complete within bounded batches");
}
function quoteBatch(task: HistoryTask) {
  const dates: string[] = [];
  for (
    let date = Temporal.PlainDate.from(task.from);
    date.toString() <= task.to;
    date = date.add({ days: 1 })
  )
    dates.push(date.toString());
  return {
    complete: true,
    points: Object.fromEntries(
      task.series.map((series) => [
        series.key,
        dates.flatMap((date) =>
          series.provider === "CURRENCYLAYER"
            ? [{ date, value: 0.8 }]
            : date < "2026-01-02"
              ? []
              : [{ date, value: date === "2026-01-02" ? 125 : 150 }],
        ),
      ]),
    ),
  };
}
beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-04T12:00Z"));
  bookId = `pre-start-${++serial}`;
  symbol = `PREFUND${serial}`;
  inputs = fixture(false);
  mocks.inputs.mockImplementation(async () => inputs);
  mocks.fetch.mockImplementation(async (task: HistoryTask) => quoteBatch(task));
  mocks.capability.mockImplementation(async () => ({
    supported: true,
    set: vi.fn(),
  }));
  await clearHistorySeries({
    provider: "CURRENCYLAYER",
    code: "EUR",
    currency: "USD",
    key: "valuation:currencylayer:USD:EUR",
  });
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it.each(["range", "day"] as const)(
  "completes ledger summaries/details and group/footer returns with pre-start FX (%s)",
  async (mode) => {
    mocks.capability.mockImplementation(async () => ({
      supported: mode === "range",
      set: vi.fn(),
    }));
    const result = (await complete(ledger())) as AccountReturnDetails;
    // EUR 100 / 0.8 = USD 125 invested; terminal value USD 150 => 20%.
    expect(result.mwr).toBeCloseTo(0.2, 12);
    expect(result.diagnostics).toEqual([]);
    expect(result).toMatchObject({
      startDate: "2026-01-01",
      asOfDate: "2026-01-04",
      effectiveStartDate: "2026-01-02",
    });
    const plan = await getReturnPlan(
      ledger(),
      "revision",
      inputs.asOfDate,
      publication,
    );
    expect(
      plan!.plan.scopes[0]!.requests.filter(
        (r) => r.currency === "EUR" && r.date === "2025-12-31",
      ),
    ).toHaveLength(1);
    expect(
      mocks.fetch.mock.calls.some(
        ([task]: [HistoryTask]) =>
          task.series.some((s) => s.code === "EUR") &&
          task.from <= "2025-12-31" &&
          task.to >= "2025-12-31",
      ),
    ).toBe(true);
    const details = (await complete(ledger(true))) as AccountReturnDetails;
    expect(details.cashFlows).toEqual([
      expect.objectContaining({
        date: "2026-01-02",
        amount: 125,
        transactionId: "purchase",
      }),
    ]);
    expect(
      details.cashFlows.every((flow) => flow.date >= inputs.startDate),
    ).toBe(true);
    const summary = (await complete(scope())) as AccountReturnSummaries;
    expect(summary.total.mwr).toBeCloseTo(0.2, 12);
    expect(summary.rows.find((r) => r.id === "group")?.mwr).toBeCloseTo(
      0.2,
      12,
    );
    const classified = (await complete({
      ...scope(),
      grouping: "assetClass",
    })) as AccountReturnSummaries;
    expect(classified.total).toEqual(summary.total);
    const calls = mocks.fetch.mock.calls.length;
    expect(await complete(ledger(true))).toEqual(details);
    expect(mocks.fetch).toHaveBeenCalledTimes(calls);
    const probes = mocks.fetch.mock.calls.flatMap(([task]: [HistoryTask]) =>
      task.series.map((s) => `${s.key}:${task.from}:${task.to}:${task.mode}`),
    );
    expect(new Set(probes).size).toBe(probes.length);
  },
);
it("plans the omitted pre-start day even when EUR already has an in-range single-day dependency", async () => {
  inputs = fixture(true);
  mocks.capability.mockImplementation(async () => ({
    supported: false,
    set: vi.fn(),
  }));
  const details = (await complete(ledger(true))) as AccountReturnDetails;
  expect(details.mwr).toBeCloseTo(0.2, 12);
  expect(details.diagnostics).toEqual([]);
  const dates = mocks.fetch.mock.calls.flatMap(([task]: [HistoryTask]) =>
    task.series.some((s) => s.code === "EUR") ? [task.from] : [],
  );
  expect(dates.sort()).toEqual(["2025-12-31", "2026-01-02"]);
});
it("deduplicates pre-start dependencies and keeps future dates and identity conversions out of the plan", () => {
  inputs.transactions[0]!.bookings.push(
    booking("future", "2026-01-05", "1", { currency: "EUR" }),
    booking("identity", "2025-12-31", "1"),
  );
  const requests = capitalRateRequests({
    ...inputs,
    transactions: [...inputs.transactions, ...inputs.transactions],
  });
  expect(
    requests.filter((r) => r.currency === "EUR" && r.date === "2025-12-31"),
  ).toHaveLength(1);
  expect(requests.every((r) => r.date <= inputs.asOfDate)).toBe(true);
  expect(
    requests.some((r) => r.unit === "CURRENCY" && r.currency === "USD"),
  ).toBe(false);
});

it("rebuilds incomplete v2 plans and results while reusing the unchanged transaction basis", async () => {
  const artifacts = await returnArtifacts(bookId);
  const basisId = returnArtifactId([
    "basis-v1",
    "revision",
    inputs.asOfDate,
    "stock",
  ]);
  const key = returnArtifactId(["stock"]);
  const oldPlanId = returnArtifactId([
    "plan-v2",
    "revision",
    inputs.asOfDate,
    publication,
    "all",
    "accountStructure",
    ledger().target,
  ]);
  const oldResultId = returnArtifactId([
    "result-v2",
    "revision",
    inputs.asOfDate,
    publication,
    key,
    false,
  ]);
  const expiry = Date.now() + 900_000;
  await artifacts.save(
    basisId,
    { ...inputs, initialBalances: [...inputs.initialBalances] },
    expiry,
  );
  await artifacts.save(
    oldPlanId,
    {
      revision: "revision",
      startDate: inputs.startDate,
      asOfDate: inputs.asOfDate,
      referenceCurrency: "USD",
      basisId,
      scopes: [{ key, accountIds: ["stock"], applicable: true, requests: [] }],
      targets: [{ id: "stock", name: "stock", kind: "account", key }],
    },
    expiry,
  );
  await artifacts.save(
    oldResultId,
    {
      data: {
        ...emptyAccountReturnResult(),
        name: "stock",
        referenceCurrency: "USD",
        startDate: inputs.startDate,
        asOfDate: inputs.asOfDate,
        effectiveStartDate: "2026-01-02",
        effectiveEndDate: inputs.asOfDate,
        mwr: 0.99,
        valuations: [],
        cashFlows: [],
      },
      validUntil: expiry,
      missing: false,
    },
    expiry,
  );
  const result = (await complete(ledger())) as AccountReturnDetails;
  expect(result.mwr).toBeCloseTo(0.2, 12);
  const planned = await getReturnPlan(
    ledger(),
    "revision",
    inputs.asOfDate,
    publication,
  );
  expect(planned!.id).not.toBe(oldPlanId);
  expect(planned!.plan.basisId).toBe(basisId);
  expect(mocks.inputs).not.toHaveBeenCalled();
});
