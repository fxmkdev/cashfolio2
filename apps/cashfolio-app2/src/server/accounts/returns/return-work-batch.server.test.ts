import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toMoney } from "../../../shared/money";
import { emptyAccountReturnResult } from "../../../shared/accounts/account-returns";
import { HistoryPending } from "../../valuation/history/types";
import { groupingReturnInputs } from "./return-staging-test-support";
import type { ReturnWorkState } from "./return-work-store.server";
import type { ReturnWorkSession } from "./return-work-types";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  pump: vi.fn(),
  pending: vi.fn(),
  calculate: vi.fn(),
  engine: vi.fn(),
  save: vi.fn(),
  basis: vi.fn(),
  results: vi.fn(),
}));
vi.mock("../../valuation/history/loader.server", () => ({
  createHistoricalLoader: async () => ({
    lookup: mocks.lookup,
    pump: mocks.pump,
    pending: mocks.pending,
  }),
}));
vi.mock("./return-artifacts.server", async (original) => ({
  ...(await original<typeof import("./return-artifacts.server")>()),
  returnArtifacts: async () => ({ save: mocks.save }),
}));
vi.mock("./return-engine.server", async (original) => ({
  ...(await original<typeof import("./return-engine.server")>()),
  createReturnEngine: mocks.engine,
}));
vi.mock("./return-plan.server", async (original) => ({
  ...(await original<typeof import("./return-plan.server")>()),
  readReturnBasis: mocks.basis,
}));
vi.mock("./return-work-results.server", async (original) => ({
  ...(await original<typeof import("./return-work-results.server")>()),
  readScopeResults: mocks.results,
}));
import { runReturnWorkBatch } from "./return-work-batch.server";

const args = {
  accountBookId: "batch",
  grouping: "accountStructure" as const,
  accountState: "all" as const,
};
const data = {
  ...emptyAccountReturnResult(),
  name: "Account",
  referenceCurrency: "CHF",
  startDate: "2026-01-01",
  asOfDate: "2026-11-07",
  valuations: [],
  cashFlows: [],
};
const identity = {
  binding: "binding",
  context: "context",
  revision: "revision",
  asOfDate: data.asOfDate,
  publication: "2026-11-06",
};
const session: Pick<ReturnWorkSession, "plan" | "identity"> = {
  identity,
  plan: {
    revision: identity.revision,
    startDate: data.startDate,
    asOfDate: data.asOfDate,
    referenceCurrency: data.referenceCurrency,
    basisId: "basis",
    scopes: Array.from({ length: 8 }, (_, i) => ({
      key: String(i),
      applicable: true,
      accountIds: [String(i)],
      requests: [
        {
          unit: "SECURITY",
          currency: null,
          cryptocurrency: null,
          symbol: `S${i}`,
          tradeCurrency: "USD",
          date: "2026-11-01",
        },
      ],
    })),
    targets: Array.from({ length: 8 }, (_, i) => ({
      key: String(i),
      id: String(i),
      name: `Account ${i}`,
      kind: "account",
    })),
  },
};
const state = (): ReturnWorkState => ({
  ...identity,
  createdAt: Date.now(),
  validUntil: Date.now() + 900_000,
  planId: "plan",
  sequence: 0,
  phase: "history",
  done: [],
  failures: {},
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-07T12:00Z"));
  mocks.basis.mockResolvedValue(groupingReturnInputs());
  mocks.results.mockImplementation(async () => new Map());
  mocks.engine.mockResolvedValue({ calculate: mocks.calculate });
  mocks.calculate.mockResolvedValue(data);
  mocks.lookup.mockResolvedValue({
    rate: toMoney(1),
    source: "timeSeries",
    validUntil: Infinity,
  });
  mocks.pending.mockReturnValue(1);
});
afterEach(() => vi.useRealTimers());

it.each([1, 128])(
  "caps provider work and calculates at most four scopes after pumping (batchSize %s)",
  async (batchSize) => {
    let blocked = true;
    mocks.lookup.mockImplementation(async () => {
      if (blocked) throw new HistoryPending();
      return { rate: toMoney(1), source: "timeSeries", validUntil: Infinity };
    });
    mocks.pump.mockImplementation(async () => {
      blocked = false;
    });
    const batch = await runReturnWorkBatch(
      { ...args, batchSize },
      session,
      state(),
    );
    expect(mocks.pump).toHaveBeenCalledExactlyOnceWith(Math.min(4, batchSize));
    expect(batch?.calculated).toBe(4);
    expect([...batch!.results.keys()]).toEqual(["0", "1", "2", "3"]);
    expect(mocks.calculate).toHaveBeenCalledTimes(4);
    expect(mocks.save).toHaveBeenCalledTimes(4);
  },
);
it("publishes a ready scope before pumping dependencies for slower scopes", async () => {
  mocks.lookup.mockImplementation(async ({ symbol }) => {
    if (symbol !== "S0") throw new HistoryPending();
    return { rate: toMoney(1), source: "timeSeries", validUntil: Infinity };
  });
  const batch = await runReturnWorkBatch(args, session, state());
  expect([...batch!.results.keys()]).toEqual(["0"]);
  expect(mocks.pump).not.toHaveBeenCalled();
});
it("publishes recovered artifacts before pumping pending history", async () => {
  mocks.results.mockResolvedValue(
    new Map([
      ["0", { data, validUntil: Date.now() + 900_000, missing: false }],
    ]),
  );
  mocks.lookup.mockRejectedValue(new HistoryPending());
  const batch = await runReturnWorkBatch(args, session, state());
  expect(batch?.recovered).toBe(true);
  expect(batch?.calculated).toBe(0);
  expect(mocks.pump).not.toHaveBeenCalled();
});
it("retains the first-pass timer across historical pumping and the second pass", async () => {
  mocks.lookup.mockImplementation(async () => {
    vi.setSystemTime(Date.now() + 1000);
    throw new HistoryPending();
  });
  mocks.pump.mockImplementation(async () => {
    vi.setSystemTime(Date.now() + 2000);
  });
  const batch = await runReturnWorkBatch(args, session, state());
  expect(mocks.lookup).toHaveBeenCalledTimes(8);
  expect(mocks.pump).toHaveBeenCalledOnce();
  expect(batch?.calculated).toBe(0);
  expect(mocks.calculate).not.toHaveBeenCalled();
});
it("stops starting further scopes when calculation consumes the ten-second budget", async () => {
  mocks.calculate.mockImplementation(async () => {
    vi.setSystemTime(Date.now() + 6000);
    return data;
  });
  const batch = await runReturnWorkBatch(args, session, state());
  expect(batch?.calculated).toBe(2);
  expect(mocks.pump).not.toHaveBeenCalled();
});
