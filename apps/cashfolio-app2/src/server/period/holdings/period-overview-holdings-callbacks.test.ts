import { describe, expect, it, vi } from "vitest";
import { AccountType, Unit } from "../../../.prisma-client/enums";
import { toMoney } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
import {
  applyHoldingTransactionsToGainLossState,
  computeHoldingGainLossSplit,
  finalizeHoldingGainLossState,
  initializeHoldingGainLossState,
} from "./period-overview-holdings";
import type {
  HoldingAccountExecutionEvent,
  HoldingAccountGainLoss,
  HoldingAccountOpenLotValuation,
  HoldingRateConvertibleAccount,
  HoldingTransactionBooking,
  HoldingTransactionSkippedItem,
} from "./period-overview-holdings-types";

const day = new Date("2026-02-10T00:00:00.000Z");
const period = {
  periodStart: new Date("2026-02-01T00:00:00.000Z"),
  periodEndExclusive: new Date("2026-03-01T00:00:00.000Z"),
  initialRateDate: new Date("2026-01-31T00:00:00.000Z"),
  periodEnd: new Date("2026-02-28T00:00:00.000Z"),
};
const account: HoldingRateConvertibleAccount = {
  id: "holding",
  unit: Unit.SECURITY,
  currency: null,
  cryptocurrency: null,
  symbol: "AAPL",
  tradeCurrency: "USD",
};

function booking(
  id: string,
  value: number,
  accountId = account.id,
): HoldingTransactionBooking {
  return {
    ...account,
    id,
    accountId,
    date: day,
    value: toMoney(value),
    accountType: AccountType.ASSET,
    equityAccountSubtype: null,
    description: `${id} description`,
    transactionDescription: `${id} transaction`,
    transactionId: `${id}-transaction`,
  };
}

describe("holding engine callbacks and counters", () => {
  it("orders same-day executions by booking ID and emits each account's explain data before its totals", async () => {
    const { id: _accountId, ...accountUnit } = account;
    const callbackOrder: string[] = [];
    const events: HoldingAccountExecutionEvent[] = [];
    const onAccountOpenLotValuation = vi.fn(
      (lot: HoldingAccountOpenLotValuation) => {
        callbackOrder.push(`lot:${lot.accountId}`);
      },
    );
    const onAccountGainLoss = vi.fn((gainLoss: HoldingAccountGainLoss) => {
      callbackOrder.push(`total:${gainLoss.accountId}`);
    });
    const converted = new Map([
      ["z-sell", toMoney(-130)],
      ["cash-sell", toMoney(130)],
      ["a-buy", toMoney(200)],
      ["cash-buy", toMoney(-200)],
    ]);
    const result = await computeHoldingGainLossSplit({
      ...period,
      holdingAccounts: [account, { ...account, id: "second" }],
      initialBalanceByAccountId: new Map([["second", toMoney(1)]]),
      // Deliberately supply the disposal before the same-day acquisition.
      transactions: [
        {
          bookings: [booking("z-sell", -1), booking("cash-sell", 130, "cash")],
        },
        { bookings: [booking("a-buy", 2), booking("cash-buy", -200, "cash")] },
      ],
      resolveRate: async ({ date }) =>
        toMoney(date === period.initialRateDate ? 90 : 150),
      convertBookingToReference: async ({ id }) => converted.get(id) ?? null,
      onAccountExecutionEvent: (event) => {
        events.push(event);
        callbackOrder.push(`execution:${event.bookingId}`);
      },
      onAccountOpenLotValuation,
      onAccountGainLoss,
    });

    expect(callbackOrder).toEqual([
      "execution:a-buy",
      "execution:z-sell",
      "lot:holding",
      "total:holding",
      "lot:second",
      "total:second",
    ]);
    expect(toNumericMoney(events[1])).toEqual({
      accountId: account.id,
      bookingId: "z-sell",
      bookingDescription: "z-sell description",
      transactionDescription: "z-sell transaction",
      transactionId: "z-sell-transaction",
      date: day,
      quantity: -1,
      pricingSource: "directConversion",
      marketReferenceAmount: -130,
      residualAllocationAmount: 0,
      effectiveReferenceAmount: -130,
      executionUnitPriceInReference: 130,
      realizedGainLossDelta: 30,
      runningRealizedGainLoss: 30,
      lotMatches: [
        {
          acquisitionSortKey: `${day.toISOString()}::a-buy`,
          matchedQuantity: 1,
          lotUnitCostInReference: 100,
          executionUnitPriceInReference: 130,
          realizedGainLossDelta: 30,
          runningEventRealizedGainLoss: 30,
        },
      ],
    });
    expect(toNumericMoney(onAccountOpenLotValuation.mock.calls[0][0])).toEqual({
      accountId: account.id,
      acquisitionSortKey: `${day.toISOString()}::a-buy`,
      quantity: 1,
      unitCostInReference: 100,
      periodEndRate: 150,
      unrealizedGainLoss: 50,
    });
    expect(
      toNumericMoney(onAccountGainLoss.mock.calls.map(([value]) => value)),
    ).toEqual([
      {
        ...accountUnit,
        accountId: account.id,
        realizedGainLoss: 30,
        unrealizedGainLoss: 50,
      },
      {
        ...accountUnit,
        accountId: "second",
        realizedGainLoss: 0,
        unrealizedGainLoss: 60,
      },
    ]);
    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 30,
      unrealizedGainLoss: 110,
      convertedCount: 4,
      skippedCount: 0,
    });
  });

  it("updates counters before missing-conversion callbacks and retains market-fallback execution metadata", async () => {
    const state = await initializeHoldingGainLossState({
      holdingAccounts: [account],
      initialBalanceByAccountId: new Map(),
      initialRateDate: period.initialRateDate,
      resolveRate: vi.fn(),
    });
    const observedCounters: number[][] = [];
    const onSkippedItem = vi.fn((_item: HoldingTransactionSkippedItem) => {
      observedCounters.push([state.convertedCount, state.skippedCount]);
    });
    const converted = new Map([
      ["cash-known", toMoney(-100)],
      ["holding-known", toMoney(120)],
    ]);
    await applyHoldingTransactionsToGainLossState({
      ...period,
      state,
      transactions: [
        {
          bookings: [
            booking("holding-missing", 1),
            booking("cash-known", -100, "cash"),
          ],
        },
        {
          bookings: [
            booking("holding-known", 1),
            booking("cash-missing", -120, "cash"),
          ],
        },
      ],
      convertBookingToReference: async ({ id }) => converted.get(id) ?? null,
      onSkippedItem,
    });

    expect(observedCounters).toEqual([
      [0, 1],
      [2, 2],
    ]);
    expect(onSkippedItem.mock.calls.map(([item]) => item)).toEqual([
      {
        accountId: account.id,
        bookingId: "holding-missing",
        bookingDescription: "holding-missing description",
        transactionDescription: "holding-missing transaction",
        transactionId: "holding-missing-transaction",
        reason: "missingConversion",
        date: day,
      },
      {
        accountId: "cash",
        bookingId: "cash-missing",
        bookingDescription: "cash-missing description",
        transactionDescription: "cash-missing transaction",
        transactionId: "cash-missing-transaction",
        reason: "missingConversion",
        date: day,
      },
    ]);
    const onAccountExecutionEvent = vi.fn();
    const result = await finalizeHoldingGainLossState({
      state,
      periodEnd: period.periodEnd,
      resolveRate: async () => toMoney(150),
      onAccountExecutionEvent,
    });
    expect(onAccountExecutionEvent).toHaveBeenCalledTimes(1);
    expect(
      toNumericMoney(onAccountExecutionEvent.mock.calls[0][0]),
    ).toMatchObject({
      bookingId: "holding-known",
      pricingSource: "marketFallback",
      marketReferenceAmount: 120,
      residualAllocationAmount: 0,
      effectiveReferenceAmount: 120,
      executionUnitPriceInReference: 120,
    });
    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 0,
      unrealizedGainLoss: 30,
      convertedCount: 2,
      skippedCount: 2,
    });
  });

  it("keeps realized explain data when the period-end rate is unavailable", async () => {
    const callbackOrder: string[] = [];
    const onAccountOpenLotValuation = vi.fn();
    const onSkippedItem = vi.fn((item) => callbackOrder.push(item.reason));
    const onAccountGainLoss = vi.fn(() => callbackOrder.push("total"));
    const result = await computeHoldingGainLossSplit({
      ...period,
      holdingAccounts: [account],
      initialBalanceByAccountId: new Map([[account.id, toMoney(2)]]),
      transactions: [
        { bookings: [booking("sell", -1), booking("cash", 130, "cash")] },
      ],
      resolveRate: async ({ date }) =>
        date === period.initialRateDate ? toMoney(100) : null,
      convertBookingToReference: async ({ id }) =>
        toMoney(id === "sell" ? -130 : 130),
      onAccountExecutionEvent: () => callbackOrder.push("execution"),
      onAccountOpenLotValuation,
      onSkippedItem,
      onAccountGainLoss,
    });
    expect(callbackOrder).toEqual([
      "execution",
      "missingPeriodEndRate",
      "total",
    ]);
    expect(onSkippedItem).toHaveBeenCalledExactlyOnceWith({
      accountId: account.id,
      reason: "missingPeriodEndRate",
      date: period.periodEnd,
    });
    expect(onAccountOpenLotValuation).not.toHaveBeenCalled();
    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 30,
      unrealizedGainLoss: 0,
      convertedCount: 2,
      skippedCount: 1,
    });
  });
});
