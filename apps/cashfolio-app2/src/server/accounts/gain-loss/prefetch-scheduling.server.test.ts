import { beforeEach, describe, expect, it, vi } from "vitest";
import { toNumericMoney } from "../../money-boundary";
import type { DecimalValuationRateLookupResult } from "../../valuation/types";
import {
  account,
  calculateAccountGainLoss,
  createAccountGainLossLookupScheduler,
  deferred,
  executionDate,
  Lookup,
  lookup,
  lookups,
  period,
  rateResult,
  resetPrefetchLookups,
  trade,
} from "./prefetch.test-support";

beforeEach(resetPrefetchLookups);

describe("bounded account G/L valuation prefetch", () => {
  it("prices twelve independent trades in three waves before publishing basis, then overlaps closing prices", async () => {
    const holdings = Array.from({ length: 12 }, (_, index) =>
      account(`stock:${index}`),
    );
    const pending: {
      input: Lookup;
      gate: ReturnType<typeof deferred<DecimalValuationRateLookupResult>>;
    }[] = [];
    let active = 0;
    let peak = 0;
    lookup.mockImplementation(async (input) => {
      active += 1;
      peak = Math.max(peak, active);
      const gate = deferred<DecimalValuationRateLookupResult>();
      pending.push({ input, gate });
      try {
        return await gate.promise;
      } finally {
        active -= 1;
      }
    });
    const onBasis = vi.fn(async () => {
      expect(pending).toHaveLength(12);
      expect(active).toBe(0);
      expect(
        pending.every(
          ({ input }) => input.date.getTime() === executionDate.getTime(),
        ),
      ).toBe(true);
    });
    const resultPromise = calculateAccountGainLoss({
      ...period,
      ...lookups(),
      holdingAccounts: holdings,
      initialBalanceByAccountId: new Map(),
      transactions: holdings.map((holding) => trade(holding)),
      onBasis,
      detailAccountId: holdings[0]!.id,
    });
    // Each group is held until all four have started and is completed in reverse order.
    for (let wave = 0; wave < 6; wave += 1) {
      await vi.waitFor(() => expect(pending).toHaveLength((wave + 1) * 4));
      for (const { gate } of pending.slice(wave * 4, wave * 4 + 4).reverse())
        gate.resolve(rateResult(wave < 3 ? 100 : 120));
    }
    const result = await resultPromise;
    expect(peak).toBe(4);
    expect(onBasis).toHaveBeenCalledOnce();
    expect(
      [...result.results.values()].map((item) => toNumericMoney(item.summary)),
    ).toEqual(
      holdings.map(() => ({
        realizedGainLoss: 0,
        unrealizedGainLoss: 20,
        totalGainLoss: 20,
      })),
    );
    expect(toNumericMoney(result.unrealizedOpenLots)[0]).toMatchObject({
      quantity: 1,
      unitCostInReference: 100,
      unrealizedGainLoss: 20,
    });
  });

  it.each(["SECURITY", "CURRENCY", "CRYPTOCURRENCY"] as const)(
    "memoizes duplicate %s rate/date requests before they can occupy scheduler slots",
    async (unit) => {
      const gates = Array.from({ length: 5 }, () =>
        deferred<DecimalValuationRateLookupResult>(),
      );
      const identifier = (input: Lookup) =>
        input.symbol ?? input.sourceCurrency ?? input.cryptocurrency;
      lookup.mockImplementation(
        (input) => gates[Number(identifier(input))]!.promise,
      );
      const { resolveRate } = lookups();
      const requests = [0, 0, 0, 0, 1, 2, 3, 4].map((index) =>
        resolveRate({
          ...account(String(index)),
          unit,
          symbol: unit === "SECURITY" ? String(index) : null,
          currency: unit === "CURRENCY" ? String(index) : null,
          cryptocurrency: unit === "CRYPTOCURRENCY" ? String(index) : null,
          date: executionDate,
        }),
      );
      const result = Promise.all(requests);
      await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(4));
      expect(lookup.mock.calls.map(([input]) => identifier(input))).toEqual([
        "0",
        "1",
        "2",
        "3",
      ]);
      gates[0]!.resolve(rateResult());
      await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(5));
      gates.slice(1).forEach((gate) => gate.resolve(rateResult()));
      expect(await result).toHaveLength(8);
    },
  );

  it("releases slots after rejected or synchronously throwing lookups and handles all queued rejections", async () => {
    const schedule = createAccountGainLossLookupScheduler();
    const gates = Array.from({ length: 8 }, () =>
      deferred<DecimalValuationRateLookupResult>(),
    );
    const started: number[] = [];
    const settled = Promise.allSettled(
      gates.map((gate, index) =>
        schedule(() => {
          started.push(index);
          return gate.promise;
        }),
      ),
    );
    await vi.waitFor(() => expect(started).toHaveLength(4));
    gates.slice(0, 4).forEach((gate) => gate.reject(new Error("Unavailable")));
    await vi.waitFor(() => expect(started).toHaveLength(8));
    gates.slice(4).forEach((gate) => gate.reject(new Error("Unavailable")));
    expect((await settled).every((item) => item.status === "rejected")).toBe(
      true,
    );
    await expect(
      schedule(() => {
        throw new Error("Synchronous");
      }),
    ).rejects.toThrow("Synchronous");
    await expect(schedule(async () => rateResult())).resolves.toEqual(
      rateResult(),
    );
  });
});
