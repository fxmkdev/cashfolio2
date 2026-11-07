import { beforeEach, describe, expect, it, vi } from "vitest";
import { toMoney } from "../../../shared/money";
import type { HoldingBookingConverter } from "../../holdings/types";
import { toNumericMoney } from "../../money-boundary";
import type { DecimalValuationRateLookupResult } from "../../valuation/types";
import {
  account,
  booking,
  calculateAccountGainLoss,
  deferred,
  executionDate,
  initializeHoldingGainLossState,
  Lookup,
  lookup,
  lookups,
  period,
  prefetchAccountGainLossConversions,
  rateResult,
  resetPrefetchLookups,
  trade,
  valueAccountGainLossBasis,
} from "./prefetch.test-support";

beforeEach(resetPrefetchLookups);

describe("bounded account G/L valuation prefetch", () => {
  it("preserves FIFO matches, transfer basis, and missing-price diagnostics when execution lookups finish in reverse order", async () => {
    const source = account("source");
    const destination = { ...account("destination"), symbol: source.symbol };
    const missingBasis = account("missing-basis");
    const missingClosing = account("missing-closing");
    const holdings = [source, destination, missingBasis, missingClosing];
    const args = {
      ...period,
      holdingAccounts: holdings,
      initialBalanceByAccountId: new Map(),
      transactions: [
        trade(source, 3, "buy"),
        trade(source, -1, "sale"),
        trade(missingBasis),
        trade(missingClosing),
        {
          bookings: [
            booking(source, -1, "transfer-out"),
            booking(destination, 1, "transfer-in"),
          ].map((item) => ({ ...item, date: new Date("2026-03-01Z") })),
        },
      ],
      detailAccountId: source.id,
    };
    const rate = (input: Lookup): DecimalValuationRateLookupResult =>
      input.symbol === missingBasis.symbol ||
      (input.symbol === missingClosing.symbol &&
        input.date.getTime() === period.periodEnd.getTime())
        ? { rate: null, source: "missing" }
        : rateResult(
            input.date.getTime() === period.periodEnd.getTime() ? 120 : 100,
          );
    lookup.mockImplementation(async (input) => rate(input));
    const baseline = await calculateAccountGainLoss({ ...args, ...lookups() });
    lookup.mockClear();
    const pending: {
      input: Lookup;
      gate: ReturnType<typeof deferred<DecimalValuationRateLookupResult>>;
    }[] = [];
    lookup.mockImplementation(async (input) => {
      if (input.date.getTime() !== executionDate.getTime()) return rate(input);
      const gate = deferred<DecimalValuationRateLookupResult>();
      pending.push({ input, gate });
      return gate.promise;
    });
    const result = calculateAccountGainLoss({ ...args, ...lookups() });
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    for (const { input, gate } of pending.reverse()) gate.resolve(rate(input));
    const serialize = (value: typeof baseline) =>
      toNumericMoney({ ...value, results: [...value.results] });
    expect(serialize(await result)).toEqual(serialize(baseline));
    expect(baseline.realizedEvents).toHaveLength(2);
    expect(baseline.results.get(missingBasis.id)!.diagnostics).not.toHaveLength(
      0,
    );
    expect(
      baseline.results.get(missingClosing.id)!.summary.unrealizedGainLoss,
    ).toBeNull();
  });

  it("does not prefetch explicit G/L, irrelevant dates, or transactions with no available holding", async () => {
    const available = account("available");
    const skipped = account("skipped");
    const future = account("future");
    lookup.mockImplementation(async ({ symbol }) =>
      symbol === skipped.symbol
        ? { rate: null, source: "missing" }
        : rateResult(),
    );
    const explicit = {
      ...booking(account("explicit")),
      accountType: "EQUITY" as const,
      equityAccountSubtype: "GAIN_LOSS" as const,
    };
    await calculateAccountGainLoss({
      ...period,
      ...lookups(),
      holdingAccounts: [available, skipped, future],
      initialBalanceByAccountId: new Map([[skipped.id, toMoney(1)]]),
      transactions: [
        { bookings: [...trade(available).bookings, explicit] },
        trade(skipped),
        {
          bookings: trade(future).bookings.map((item) => ({
            ...item,
            date: period.periodEndExclusive,
          })),
        },
        { bookings: [explicit] },
      ],
    });
    expect(lookup.mock.calls.map(([input]) => input.symbol)).toEqual([
      "SKIPPED",
      "AVAILABLE",
      "AVAILABLE",
    ]);
  });

  it("bounds opening lookups and revalues cached lots without requesting prices for skipped or closed holdings", async () => {
    const holdings = Array.from({ length: 6 }, (_, index) =>
      account(String(index)),
    );
    const gates = holdings.map(() =>
      deferred<DecimalValuationRateLookupResult>(),
    );
    lookup.mockImplementation(({ symbol }) => gates[Number(symbol)]!.promise);
    const rates = lookups();
    const result = calculateAccountGainLoss({
      ...period,
      ...rates,
      holdingAccounts: holdings,
      initialBalanceByAccountId: new Map(
        holdings.map((holding) => [holding.id, toMoney(1)]),
      ),
      transactions: [],
    });
    await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(4));
    gates.slice(0, 4).forEach((gate) => gate.resolve(rateResult()));
    await vi.waitFor(() =>
      expect(
        lookup.mock.calls.filter(([input]) => input.date < period.periodStart),
      ).toHaveLength(6),
    );
    gates.slice(4).forEach((gate) => gate.resolve(rateResult()));
    await result;
    expect(lookup).toHaveBeenCalledTimes(12);

    lookup.mockClear();
    const { resolveRate } = lookups();
    await valueAccountGainLossBasis({
      periodEnd: period.periodEnd,
      resolveRate,
      basis: {
        holdings: holdings.map((holding, index) => ({
          state: {
            account: holding,
            lots:
              index === 0
                ? []
                : [
                    {
                      quantity: toMoney(1),
                      unitCostInReference: toMoney(100),
                      acquisitionSortKey: "2026-01-01::lot",
                    },
                  ],
            skipped: index === 1,
            executionEvents: [],
          },
          diagnostics: [],
          unavailable: false,
        })),
      },
    });
    expect(lookup.mock.calls.map(([input]) => input.symbol)).toEqual([
      "2",
      "3",
      "4",
      "5",
    ]);
  });

  it("prefetches residual quantities and memoizes different portions independently", async () => {
    const source = account("source"),
      destination = { ...account("destination"), symbol: source.symbol };
    const state = await initializeHoldingGainLossState({
      holdingAccounts: [source, destination],
      initialBalanceByAccountId: new Map(),
      initialRateDate: period.initialRateDate,
      resolveRate: vi.fn(),
    });
    const out = booking(source, -10, "out");
    const converter = vi.fn<HoldingBookingConverter>(async (item) =>
      item.value.times(100),
    );
    const convert = await prefetchAccountGainLossConversions({
      ...period,
      state,
      transactions: [
        {
          bookings: [
            out,
            booking(destination, 9, "in"),
            {
              ...booking(account("expense"), 1, "fee"),
              accountType: "EQUITY",
              equityAccountSubtype: "EXPENSE",
            },
          ],
        },
      ],
      convertBookingToReference: converter,
    });
    expect(
      converter.mock.calls.map(([item]) => [item.id, item.value.toString()]),
    ).toEqual([
      ["out", "-1"],
      ["fee", "1"],
    ]);
    expect((await convert({ ...out, value: toMoney(-9) }))!.toString()).toBe(
      "-900",
    );
    expect((await convert({ ...out, value: toMoney(-1) }))!.toString()).toBe(
      "-100",
    );
    expect(converter).toHaveBeenCalledTimes(3);
  });

  it("keeps price-free basis transfers and replay-dependent market fallbacks on demand", async () => {
    const source = account("source");
    const destination = { ...account("destination"), symbol: source.symbol };
    lookup.mockResolvedValue(rateResult());
    const run = (opening: number) =>
      calculateAccountGainLoss({
        ...period,
        ...lookups(),
        holdingAccounts: [source, destination],
        initialBalanceByAccountId: new Map([[source.id, toMoney(opening)]]),
        transactions: [
          { bookings: [booking(source, -1), booking(destination, 1)] },
        ],
        detailAccountId: destination.id,
      });
    await run(1);
    expect(lookup.mock.calls.map(([input]) => input.date)).toEqual([
      period.initialRateDate,
      period.periodEnd,
    ]);
    lookup.mockClear();
    await run(0);
    expect(lookup.mock.calls.map(([input]) => input.date)).toEqual([
      executionDate,
      period.periodEnd,
    ]);
  });
});
