import { Unit } from "../.prisma-client/enums";

export type PeriodGroupNode = {
  id: string;
  name: string;
  parentGroupId: string | null;
};

type ExpenseBucket = {
  id: string;
  label: string;
  kind: "group" | "account";
};

export type ExpenseBreakdownAccumulatorItem = {
  id: string;
  label: string;
  kind: "group" | "account";
  amount: number;
};

export type HoldingEvent = {
  date: Date;
  balanceDelta: number;
};

export type HoldingGainLossSeriesEvent = {
  rate: number;
  balanceDelta: number;
};

type MultiUnitBooking = {
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getBookingUnitIdentifier(booking: MultiUnitBooking): string | null {
  if (booking.unit === Unit.CURRENCY) {
    return booking.currency
      ? `currency:${booking.currency.toUpperCase()}`
      : null;
  }
  if (booking.unit === Unit.CRYPTOCURRENCY) {
    return booking.cryptocurrency
      ? `crypto:${booking.cryptocurrency.toUpperCase()}`
      : null;
  }
  if (!booking.symbol || !booking.tradeCurrency) {
    return null;
  }
  return `security:${booking.symbol.toUpperCase()}:${booking.tradeCurrency.toUpperCase()}`;
}

export function isMultiUnitTransaction(bookings: MultiUnitBooking[]): boolean {
  const unitIdentifiers = new Set<string>();

  for (const booking of bookings) {
    const unitIdentifier = getBookingUnitIdentifier(booking);
    if (!unitIdentifier) {
      return false;
    }
    unitIdentifiers.add(unitIdentifier);
  }

  return unitIdentifiers.size > 1;
}

export function shouldIncludeTransactionForPeriod(args: {
  bookingDates: Date[];
  periodStart: Date;
  periodEndExclusive: Date;
}): boolean {
  const { bookingDates, periodStart, periodEndExclusive } = args;

  if (bookingDates.length === 0) {
    return false;
  }

  const hasBookingInPeriod = bookingDates.some(
    (date) => date >= periodStart && date < periodEndExclusive,
  );
  if (!hasBookingInPeriod) {
    return false;
  }

  return bookingDates.every((date) => date < periodEndExclusive);
}

function resolveGroupPathToRoot(args: {
  groupId: string;
  groupById: Map<string, PeriodGroupNode>;
}): PeriodGroupNode[] {
  const { groupId, groupById } = args;
  const path: PeriodGroupNode[] = [];
  const visited = new Set<string>();

  let currentGroupId: string | null = groupId;
  while (currentGroupId) {
    if (visited.has(currentGroupId)) {
      break;
    }

    visited.add(currentGroupId);
    const group = groupById.get(currentGroupId);
    if (!group) {
      break;
    }

    path.push(group);
    currentGroupId = group.parentGroupId;
  }

  return path;
}

function getTopLevelGroupBelowRoot(args: {
  groupId: string;
  groupById: Map<string, PeriodGroupNode>;
}): PeriodGroupNode | null {
  const path = resolveGroupPathToRoot(args);
  if (path.length === 0) return null;

  if (path.length === 1) {
    return path[0];
  }

  return path[path.length - 2];
}

export function createExpenseBucket(args: {
  accountId: string;
  accountName: string;
  groupId: string | null;
  groupById: Map<string, PeriodGroupNode>;
}): ExpenseBucket {
  if (args.groupId) {
    const topLevelGroup = getTopLevelGroupBelowRoot({
      groupId: args.groupId,
      groupById: args.groupById,
    });

    if (topLevelGroup) {
      return {
        id: `group:${topLevelGroup.id}`,
        label: topLevelGroup.name,
        kind: "group",
      };
    }
  }

  return {
    id: `account:${args.accountId}`,
    label: args.accountName,
    kind: "account",
  };
}

export function buildExpenseBreakdownItems(
  items: ExpenseBreakdownAccumulatorItem[],
): {
  totalAmount: number;
  items: Array<{
    id: string;
    label: string;
    kind: "group" | "account";
    amount: number;
    percentage: number;
  }>;
} {
  const positiveItems = items.filter((item) => item.amount > 0);
  const totalRaw = positiveItems.reduce((sum, item) => sum + item.amount, 0);

  const sortedItems = positiveItems
    .map((item) => ({
      ...item,
      amount: round2(item.amount),
      percentage: totalRaw <= 0 ? 0 : round2((item.amount / totalRaw) * 100),
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    totalAmount: round2(
      sortedItems.reduce((sum, item) => sum + item.amount, 0),
    ),
    items: sortedItems,
  };
}

export function computeHoldingGainLossForEventSeries(args: {
  initialBalance: number;
  initialRate: number;
  events: HoldingGainLossSeriesEvent[];
}): number {
  let balance = args.initialBalance;
  let previousRate = args.initialRate;
  let gainLoss = 0;

  for (const event of args.events) {
    const rateDiff = event.rate - previousRate;
    gainLoss += balance * rateDiff;
    balance += event.balanceDelta;
    previousRate = event.rate;
  }

  return gainLoss;
}

export function buildAvailableYears(args: {
  firstBookingDate: Date | null;
  now: Date;
}): number[] {
  const currentYear = args.now.getUTCFullYear();
  const minYear = args.firstBookingDate
    ? startOfUtcDay(args.firstBookingDate).getUTCFullYear()
    : currentYear;

  const years: number[] = [];
  for (let year = currentYear; year >= minYear; year -= 1) {
    years.push(year);
  }

  return years;
}

export function sortHoldingEventsAscending(
  events: HoldingEvent[],
): HoldingEvent[] {
  return [...events].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function getHoldingEventDateMap(args: {
  bookings: Array<{ date: Date; value: number }>;
  periodEnd: Date;
}): Map<string, HoldingEvent> {
  const eventByDateKey = new Map<string, HoldingEvent>();

  for (const booking of args.bookings) {
    const date = startOfUtcDay(booking.date);
    const dateKey = toDateKey(date);
    const existing = eventByDateKey.get(dateKey);

    if (existing) {
      existing.balanceDelta += booking.value;
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
      balanceDelta: 0,
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
