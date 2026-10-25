import { describe, expect, it } from "vitest";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../../.prisma-client/enums";
import { moneySum, toMoney } from "../../../shared/money";
import { toNumericMoney } from "../../money-boundary";
import { computeHoldingGainLossSplit } from "./period-overview-holdings";
import type {
  HoldingAccountExecutionEvent,
  HoldingAccountOpenLotValuation,
  HoldingTransactionBooking,
} from "./period-overview-holdings-types";

const source = {
  id: "source",
  unit: Unit.SECURITY,
  currency: null,
  cryptocurrency: null,
  symbol: "AAPL",
  tradeCurrency: "USD",
};
const destination = { ...source, id: "destination" };
const periodStart = new Date("2026-02-01Z");
const initialRateDate = new Date("2026-01-31Z");

function booking(
  id: string,
  accountId: string,
  value: number,
  date: string,
): HoldingTransactionBooking {
  return {
    ...source,
    id,
    accountId,
    value: toMoney(value),
    date: new Date(date),
    accountType: AccountType.BALANCE,
    equityAccountSubtype: null,
  };
}

function cashBooking(
  id: string,
  value: number,
  date: string,
): HoldingTransactionBooking {
  return {
    ...booking(id, "cash", value, date),
    unit: Unit.CURRENCY,
    currency: "CHF",
    symbol: null,
    tradeCurrency: null,
  };
}

describe("mixed-period holding replay", () => {
  it.each([
    { fee: 0, shuffled: false },
    { fee: 0, shuffled: true },
    { fee: 1, shuffled: false },
    { fee: 1, shuffled: true },
  ])(
    "replays carry legs before intervening sales (fee $fee, shuffled $shuffled)",
    async ({ fee, shuffled }) => {
      const carryBookings = [
        booking("before-period", source.id, -5, "2026-01-31Z"),
        booking("out", source.id, -5 - fee, "2026-02-01Z"),
        booking("in", destination.id, 10, "2026-02-10Z"),
        ...(fee
          ? [
              {
                ...cashBooking("fee", 150, "2026-02-01Z"),
                accountId: "expense",
                accountType: AccountType.EQUITY,
                equityAccountSubtype: EquityAccountSubtype.EXPENSE,
              },
            ]
          : []),
      ];
      const transactions = [
        { bookings: carryBookings },
        {
          bookings: [
            booking("sale", source.id, -1, "2026-02-05Z"),
            cashBooking("proceeds", 150, "2026-02-05Z"),
          ],
        },
      ];
      if (shuffled) {
        carryBookings.reverse();
        transactions.reverse();
      }
      const events: HoldingAccountExecutionEvent[] = [];
      const lots: HoldingAccountOpenLotValuation[] = [];
      const result = await computeHoldingGainLossSplit({
        holdingAccounts: [source, destination],
        initialBalanceByAccountId: new Map([[source.id, toMoney(5)]]),
        transactions,
        periodStart,
        periodEndExclusive: new Date("2026-03-01Z"),
        initialRateDate,
        periodEnd: new Date("2026-02-28Z"),
        resolveRate: async ({ date }) =>
          toMoney(date === initialRateDate ? 100 : 200),
        convertBookingToReference: async (item) =>
          item.value.times(item.unit === Unit.CURRENCY ? 1 : 150),
        onAccountExecutionEvent: (event) => events.push(event),
        onAccountOpenLotValuation: (lot) => lots.push(lot),
      });

      expect(toNumericMoney(result)).toMatchObject({
        realizedGainLoss: 0,
        unrealizedGainLoss: 950 - fee * 50,
        skippedCount: 0,
      });
      expect(
        toNumericMoney(
          events.map((event) => ({
            id: event.bookingId,
            quantity: event.quantity,
            price: event.executionUnitPriceInReference,
            gain: event.realizedGainLossDelta,
            matches: event.lotMatches,
          })),
        ),
      ).toEqual([
        ...(fee
          ? [{ id: "out", quantity: -1, price: 150, gain: 0, matches: [] }]
          : []),
        { id: "sale", quantity: -1, price: 150, gain: 0, matches: [] },
      ]);
      const sourceLots = lots.filter((lot) => lot.accountId === source.id);
      expect(
        toNumericMoney(moneySum(sourceLots.map((lot) => lot.quantity))),
      ).toBe(-1 - fee);
      expect(
        sourceLots.map((lot) => toNumericMoney(lot.unitCostInReference)),
      ).toEqual(Array(1 + fee).fill(150));
      expect(
        toNumericMoney(lots.filter((lot) => lot.accountId === destination.id)),
      ).toEqual([
        expect.objectContaining({ quantity: 10, unitCostInReference: 100 }),
      ]);
    },
  );

  it("skips all dated carry legs when a later receipt has no conversion", async () => {
    const events: HoldingAccountExecutionEvent[] = [];
    const lots: HoldingAccountOpenLotValuation[] = [];
    const result = await computeHoldingGainLossSplit({
      holdingAccounts: [source, destination],
      initialBalanceByAccountId: new Map([[source.id, toMoney(5)]]),
      transactions: [
        {
          bookings: [
            booking("before-period", source.id, -5, "2026-01-31Z"),
            booking("out", source.id, -5, "2026-02-01Z"),
            booking("in", destination.id, 10, "2026-02-10Z"),
          ],
        },
        {
          bookings: [
            booking("sale", source.id, -1, "2026-02-05Z"),
            cashBooking("proceeds", 150, "2026-02-05Z"),
          ],
        },
      ],
      periodStart,
      periodEndExclusive: new Date("2026-03-01Z"),
      initialRateDate,
      periodEnd: new Date("2026-02-28Z"),
      resolveRate: async ({ date }) =>
        toMoney(date === initialRateDate ? 100 : 200),
      convertBookingToReference: async (item) =>
        item.id === "in"
          ? null
          : item.value.times(item.unit === Unit.CURRENCY ? 1 : 150),
      onAccountExecutionEvent: (event) => events.push(event),
      onAccountOpenLotValuation: (lot) => lots.push(lot),
    });

    expect(toNumericMoney(result)).toEqual({
      realizedGainLoss: 50,
      unrealizedGainLoss: 400,
      convertedCount: 3,
      skippedCount: 1,
    });
    expect(events).toHaveLength(1);
    expect(toNumericMoney(events[0])).toMatchObject({
      bookingId: "sale",
      realizedGainLossDelta: 50,
    });
    expect(toNumericMoney(lots)).toEqual([
      expect.objectContaining({
        accountId: source.id,
        quantity: 4,
        unitCostInReference: 100,
      }),
    ]);
  });
});
