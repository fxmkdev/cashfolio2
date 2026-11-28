import { afterEach, expect, it, vi } from "vitest";
import { toMoney } from "../../../shared/money";
import { encodeMoneyCache } from "../../money-cache-codec";
import type {
  AccountReturnDetails,
  AccountReturnSummaries,
} from "../../../shared/accounts/account-returns";
import {
  largeReturnInputs,
  LARGE_RETURN_TRANSACTION_COUNT,
} from "./return-large-book.test-support";
import type { ReturnWorkArgs } from "./return-work-types";
const mocks = vi.hoisted(() => ({ inputs: vi.fn() }));
vi.mock("./return-inputs.server", () => ({
  loadAccountReturnInputs: mocks.inputs,
}));
vi.mock("../../../redis.server", () => ({ getRedisClient: async () => null }));
vi.mock("../../period/cache/period-cache.server", () => ({
  getPeriodCacheGeneration: async () => "large-revision",
  getPeriodCacheEnvOrThrowWhenRedisAvailable: () => "test",
}));
vi.mock("../../valuation/lookup-context", () => ({
  createValuationLookupContext: () => ({
    latestFetchableDate: new Date("2026-11-06Z"),
  }),
}));
vi.mock("./return-cache.server", async (original) => ({
  ...(await original<typeof import("./return-cache.server")>()),
  getCachedAccountReturnSummaries: async () => undefined,
  getOrLoadAccountReturnSummaries: async (
    _scope: unknown,
    load: () => Promise<{ data: unknown }>,
  ) => (await load()).data,
}));
vi.mock("../../valuation/history/loader.server", () => ({
  createHistoricalLoader: async () => ({
    lookup: async ({ currency, date }: { currency: string; date: Date }) => ({
      rate: toMoney(
        currency === "CHF" || date.toISOString().slice(0, 10) < "2026-11-06"
          ? 1
          : 2,
      ),
      source: "timeSeries",
      validUntil: Infinity,
    }),
    pump: () => {
      throw new Error("A cached-price regression must not fetch providers.");
    },
    pending: () => 0,
  }),
}));
import { queryAccountReturnWork } from "./account-returns.server";
async function complete(args: ReturnWorkArgs) {
  let continuation: string | undefined;
  for (let i = 0; i < 20; i++) {
    const result = await queryAccountReturnWork(
      { ...args, continuation },
      "user",
    );
    if (result.status === "complete") return result.data;
    if (result.status === "restart")
      throw new Error("Large books must not restart after local eviction.");
    continuation = result.continuation;
  }
  throw new Error("Large return work did not finish.");
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("completes 100,000 transactions beyond the local cache budget without Redis or restart loops", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T12:00Z"));
  vi.spyOn(console, "info").mockImplementation(() => {});
  const inputs = largeReturnInputs();
  // Size the representative records, without allocating another full-book JSON string.
  const transactionBytes = inputs.transactions.reduce(
    (sum, tx) => sum + Buffer.byteLength(JSON.stringify(encodeMoneyCache(tx))),
    0,
  );
  expect(transactionBytes).toBeGreaterThan(64 * 1024 * 1024);
  mocks.inputs.mockImplementation(
    async (_book: string, _date: Date, accountId?: string) => ({
      ...inputs,
      transactions: accountId
        ? inputs.transactions.filter((tx) =>
            tx.bookings.some((b) => b.accountId === accountId),
          )
        : inputs.transactions,
    }),
  );
  const scope: ReturnWorkArgs = {
    accountBookId: "large-book",
    accountState: "all",
    grouping: "accountStructure",
  };
  const summary = (await complete(scope)) as AccountReturnSummaries;
  expect(summary.rows).toHaveLength(9);
  expect(summary.rows.every((row) => Math.abs(row.mwr! - 1) < 1e-12)).toBe(
    true,
  );
  expect(summary.total.mwr).toBeCloseTo(1, 12);
  expect(mocks.inputs.mock.calls.length).toBeGreaterThan(1);
  const classified = (await complete({
    ...scope,
    grouping: "assetClass",
  })) as AccountReturnSummaries;
  expect(classified.total).toEqual(summary.total);
  for (const target of [
    { kind: "account", id: "holding-0" },
    { kind: "group", id: "group" },
    { kind: "total" },
  ] as const) {
    const details = (await complete({
      ...scope,
      target,
      includeDetails: true,
    })) as AccountReturnDetails;
    expect(details.mwr).toBeCloseTo(1, 12);
    expect(details.cashFlows).toHaveLength(
      target.kind === "account"
        ? LARGE_RETURN_TRANSACTION_COUNT / 8
        : LARGE_RETURN_TRANSACTION_COUNT,
    );
    expect(details.cashFlows[0]?.description).toBe(
      inputs.transactions[0]!.bookings[0]!.description,
    );
    expect(details.valuations.at(-1)?.value).toBe(
      target.kind === "account" ? 25_000 : 200_000,
    );
  }
}, 120_000);
