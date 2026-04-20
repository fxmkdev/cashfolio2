import type { Unit } from "../.prisma-client/enums";
import {
  computeHoldingGainLossForEventSeries,
  getHoldingEventDateMap,
  sortHoldingEventsAscending,
  type HoldingGainLossSeriesEvent,
} from "./period-helpers";

type HoldingRateConvertibleAccount = {
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

export async function computeHoldingAccountGainLoss(args: {
  account: HoldingRateConvertibleAccount;
  initialBalance: number;
  periodBookings: Array<{ date: Date; value: number }>;
  initialRateDate: Date;
  periodEnd: Date;
  resolveRate: (input: {
    unit: Unit;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
    date: Date;
  }) => Promise<number | null>;
}) {
  if (args.initialBalance === 0 && args.periodBookings.length === 0) {
    return { skippedCount: 0, gainLossContribution: 0 };
  }

  const initialRate = await args.resolveRate({
    unit: args.account.unit,
    currency: args.account.currency,
    cryptocurrency: args.account.cryptocurrency,
    symbol: args.account.symbol,
    tradeCurrency: args.account.tradeCurrency,
    date: args.initialRateDate,
  });

  if (initialRate == null) {
    return { skippedCount: 1, gainLossContribution: 0 };
  }

  const holdingEventDateMap = getHoldingEventDateMap({
    bookings: args.periodBookings,
    periodEnd: args.periodEnd,
  });
  const sortedEvents = sortHoldingEventsAscending(
    Array.from(holdingEventDateMap.values()),
  );

  const eventRates = await Promise.all(
    sortedEvents.map((event) =>
      args.resolveRate({
        unit: args.account.unit,
        currency: args.account.currency,
        cryptocurrency: args.account.cryptocurrency,
        symbol: args.account.symbol,
        tradeCurrency: args.account.tradeCurrency,
        date: event.date,
      }),
    ),
  );
  const nonNullEventRates = eventRates.filter(
    (eventRate): eventRate is number => eventRate != null,
  );

  if (nonNullEventRates.length !== eventRates.length) {
    return { skippedCount: 1, gainLossContribution: 0 };
  }

  const eventsForSeries: HoldingGainLossSeriesEvent[] = sortedEvents.map(
    (event, index) => ({
      rate: nonNullEventRates[index]!,
      balanceDelta: event.balanceDelta,
    }),
  );

  return {
    skippedCount: 0,
    gainLossContribution: computeHoldingGainLossForEventSeries({
      initialBalance: args.initialBalance,
      initialRate,
      events: eventsForSeries,
    }),
  };
}
