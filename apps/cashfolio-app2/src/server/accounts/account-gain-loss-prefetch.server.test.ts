import { beforeEach, describe, expect, it, vi } from "vitest";
import { toMoney } from "../../shared/money";
import { toNumericMoney } from "../money-boundary";
import {
  convertBookingValueToReferenceDetails,
  getUnitToReferenceExchangeRateDetails,
} from "../period/period-conversion";
import type { DecimalValuationRateLookupResult } from "../valuation/types";
import type {
  HoldingBookingConverter,
  HoldingRateConvertibleAccount,
  HoldingRateResolver,
  HoldingTransactionBooking,
} from "../period/holdings/period-overview-holdings-types";
import {
  calculateAccountGainLoss,
  valueAccountGainLossBasis,
} from "./account-gain-loss-calculation.server";
import { createAccountGainLossLookupScheduler } from "./account-gain-loss-prefetch.server";

type Lookup = {
  symbol?: string;
  cryptocurrency?: string;
  sourceCurrency?: string;
  date: Date;
};
const lookup = vi.hoisted(() =>
  vi.fn<(input: Lookup) => Promise<DecimalValuationRateLookupResult>>(),
);
vi.mock("../valuation.server", () => ({
  getSecurityToCurrencyExchangeRateDetails: lookup,
  getCurrencyExchangeRateDetails: lookup,
  getCryptocurrencyToCurrencyExchangeRateDetails: lookup,
}));

const period = {
  periodStart: new Date("2026-01-01Z"),
  initialRateDate: new Date("2025-12-31Z"),
  periodEnd: new Date("2026-04-30Z"),
  periodEndExclusive: new Date("2026-05-01Z"),
};
const executionDate = new Date("2026-02-01Z");
const rateResult = (value = 100): DecimalValuationRateLookupResult => ({
  rate: toMoney(value),
  source: "timeSeries",
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
function account(id: string): HoldingRateConvertibleAccount {
  return {
    id,
    unit: "SECURITY",
    currency: null,
    cryptocurrency: null,
    symbol: id.toUpperCase(),
    tradeCurrency: "CHF",
  };
}
function booking(
  holding: HoldingRateConvertibleAccount,
  value = 1,
  id = holding.id,
): HoldingTransactionBooking {
  return {
    ...holding,
    id,
    accountId: holding.id,
    value: toMoney(value),
    date: executionDate,
    accountType: "ASSET",
    equityAccountSubtype: null,
  };
}
function lookups() {
  const context = {
    referenceCurrency: "CHF",
    exchangeRateByKey: new Map<
      string,
      Promise<DecimalValuationRateLookupResult>
    >(),
    scheduleLookup: createAccountGainLossLookupScheduler(),
  };
  const resolveRate: HoldingRateResolver = async (input) =>
    (await getUnitToReferenceExchangeRateDetails({ ...input, ...context }))
      .rate;
  const convertBookingToReference: HoldingBookingConverter = async (input) =>
    (await convertBookingValueToReferenceDetails({ ...input, ...context }))
      .value;
  return { resolveRate, convertBookingToReference };
}
function trade(
  holding: HoldingRateConvertibleAccount,
  value = 1,
  id = holding.id,
) {
  return {
    bookings: [
      booking(holding, value, id),
      booking(
        { ...account("cash"), unit: "CURRENCY", symbol: null, currency: "CHF" },
        -value * 100,
        `cash:${id}`,
      ),
    ],
  };
}

beforeEach(() => {
  lookup.mockReset();
});

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
