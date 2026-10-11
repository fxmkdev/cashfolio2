import {
  type Money,
  toMoney,
  moneySubtract,
  moneyAdd,
  moneyMultiply,
} from "../../../shared/money";
import { startOfUtcDay } from "../../../shared/date";
import { Unit } from "../../../.prisma-client/enums";

export type HoldingEvent = {
  date: Date;
  balanceDelta: Money;
};

export type HoldingGainLossSeriesEvent = {
  rate: Money;
  balanceDelta: Money;
};

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computeHoldingGainLossForEventSeries(args: {
  initialBalance: Money;
  initialRate: Money;
  events: HoldingGainLossSeriesEvent[];
}): Money {
  let balance = args.initialBalance;
  let previousRate = args.initialRate;
  let gainLoss: Money = toMoney(0);

  for (const event of args.events) {
    const rateDiff = moneySubtract(event.rate, previousRate);
    gainLoss = moneyAdd(gainLoss, moneyMultiply(balance, rateDiff));
    balance = moneyAdd(balance, event.balanceDelta);
    previousRate = event.rate;
  }

  return gainLoss;
}

export function sortHoldingEventsAscending(
  events: HoldingEvent[],
): HoldingEvent[] {
  return [...events].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function getHoldingEventDateMap(args: {
  bookings: Array<{ date: Date; value: Money }>;
  periodEnd: Date;
}): Map<string, HoldingEvent> {
  const eventByDateKey = new Map<string, HoldingEvent>();

  for (const booking of args.bookings) {
    const date = startOfUtcDay(booking.date);
    const dateKey = toDateKey(date);
    const existing = eventByDateKey.get(dateKey);

    if (existing) {
      existing.balanceDelta = moneyAdd(existing.balanceDelta, booking.value);
    } else {
      eventByDateKey.set(dateKey, {
        date,
        balanceDelta: booking.value,
      });
    }
  }

  const periodEndDate = startOfUtcDay(args.periodEnd);
  const periodEndKey = toDateKey(periodEndDate);
  if (!eventByDateKey.has(periodEndKey)) {
    eventByDateKey.set(periodEndKey, {
      date: periodEndDate,
      balanceDelta: toMoney(0),
    });
  }

  return eventByDateKey;
}

export function filterConvertibleHoldingAccounts(
  accounts: Array<{
    id: string;
    unit: Unit | null;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
  }>,
  referenceCurrency: string,
) {
  return accounts
    .filter(
      (
        account,
      ): account is {
        id: string;
        unit: Unit;
        currency: string | null;
        cryptocurrency: string | null;
        symbol: string | null;
        tradeCurrency: string | null;
      } => account.unit != null,
    )
    .filter((account) => {
      if (account.unit === Unit.CURRENCY) {
        return (
          account.currency != null &&
          account.currency.toUpperCase() !== referenceCurrency
        );
      }
      if (account.unit === Unit.CRYPTOCURRENCY) {
        return account.cryptocurrency != null;
      }
      return account.symbol != null && account.tradeCurrency != null;
    });
}
