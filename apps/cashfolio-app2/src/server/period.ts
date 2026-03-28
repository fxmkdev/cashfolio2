import { createServerFn } from "@tanstack/react-start";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { prisma } from "../prisma.server";
import {
  getCryptocurrencyToCurrencyExchangeRate,
  getCurrencyExchangeRate,
  getSecurityToCurrencyExchangeRate,
} from "./valuation.server";

export const PERIOD_PRESET_MTD = "mtd";
export const PERIOD_PRESET_YTD = "ytd";
export const PERIOD_PRESET_LAST_MONTH = "last-month";
export const PERIOD_PRESET_LAST_YEAR = "last-year";

export const PERIOD_PRESET_VALUES = [
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_YTD,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
] as const;

export type PeriodPresetValue = (typeof PERIOD_PRESET_VALUES)[number];
export type PeriodSpecifier = PeriodPresetValue | "month" | "year";

export const DEFAULT_PERIOD_VALUE: PeriodPresetValue = PERIOD_PRESET_LAST_MONTH;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const ONE_EXCHANGE_RATE_PROMISE: Promise<number | null> = Promise.resolve(1);
const EQUITY_BOOKINGS_PAGE_SIZE = 1_000;
const TRANSACTIONS_PAGE_SIZE = 200;
const PERIOD_MONTH_REGEX = /^(\d{4})-(\d{2})$/;
const PERIOD_YEAR_REGEX = /^(\d{4})$/;

type NormalizedExplicitMonthPeriod = {
  year: number;
  month: number; // 0-based
  value: string;
};

type NormalizedExplicitYearPeriod = {
  year: number;
  value: string;
};

type NormalizedPeriodBase = {
  granularity: "month" | "year";
  periodSpecifier: PeriodSpecifier;
  year: number;
  month: number | null;
};

type NormalizedPeriodSelection = NormalizedPeriodBase & {
  periodValue: string;
  from: Date;
  to: Date;
  label: string;
};

type RateLookupInput = {
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
  referenceCurrency: string;
  exchangeRateByKey: Map<string, Promise<number | null>>;
};

type PeriodGroupNode = {
  id: string;
  name: string;
  parentGroupId: string | null;
};

type ExpenseBucket = {
  id: string;
  label: string;
  kind: "group" | "account";
};

type ExpenseBreakdownAccumulatorItem = {
  id: string;
  label: string;
  kind: "group" | "account";
  amount: number;
};

type HoldingEvent = {
  date: Date;
  balanceDelta: number;
};

type HoldingGainLossSeriesEvent = {
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

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfUtcMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0));
}

function endOfUtcYear(year: number): Date {
  return new Date(Date.UTC(year, 12, 0));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
}

function formatMonthPeriodValue(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}`;
}

function parseExplicitMonthPeriod(
  value: string,
): NormalizedExplicitMonthPeriod | null {
  const match = PERIOD_MONTH_REGEX.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const monthOneBased = Number(match[2]);
  if (monthOneBased < 1 || monthOneBased > 12) {
    return null;
  }

  const month = monthOneBased - 1;
  return {
    year,
    month,
    value: formatMonthPeriodValue(year, month),
  };
}

function parseExplicitYearPeriod(
  value: string,
): NormalizedExplicitYearPeriod | null {
  const match = PERIOD_YEAR_REGEX.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  return {
    year,
    value: String(year).padStart(4, "0"),
  };
}

export function isSupportedPeriodValue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();

  if ((PERIOD_PRESET_VALUES as readonly string[]).includes(normalized)) {
    return true;
  }

  return (
    parseExplicitMonthPeriod(normalized) != null ||
    parseExplicitYearPeriod(normalized) != null
  );
}

export function normalizePeriodValue(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_PERIOD_VALUE;
  }

  const normalized = value.trim().toLowerCase();

  if ((PERIOD_PRESET_VALUES as readonly string[]).includes(normalized)) {
    return normalized;
  }

  const explicitMonth = parseExplicitMonthPeriod(normalized);
  if (explicitMonth) {
    return explicitMonth.value;
  }

  const explicitYear = parseExplicitYearPeriod(normalized);
  if (explicitYear) {
    return explicitYear.value;
  }

  return DEFAULT_PERIOD_VALUE;
}

function normalizePeriodBase(args: {
  periodValue: string;
  now: Date;
}): NormalizedPeriodBase {
  const { periodValue, now } = args;
  const currentMonthStart = startOfUtcMonth(now);

  if (periodValue === PERIOD_PRESET_MTD) {
    return {
      granularity: "month",
      periodSpecifier: PERIOD_PRESET_MTD,
      year: currentMonthStart.getUTCFullYear(),
      month: currentMonthStart.getUTCMonth(),
    };
  }

  if (periodValue === PERIOD_PRESET_LAST_MONTH) {
    const lastMonthStart = addUtcMonths(currentMonthStart, -1);
    return {
      granularity: "month",
      periodSpecifier: PERIOD_PRESET_LAST_MONTH,
      year: lastMonthStart.getUTCFullYear(),
      month: lastMonthStart.getUTCMonth(),
    };
  }

  if (periodValue === PERIOD_PRESET_YTD) {
    return {
      granularity: "year",
      periodSpecifier: PERIOD_PRESET_YTD,
      year: currentMonthStart.getUTCFullYear(),
      month: null,
    };
  }

  if (periodValue === PERIOD_PRESET_LAST_YEAR) {
    return {
      granularity: "year",
      periodSpecifier: PERIOD_PRESET_LAST_YEAR,
      year: currentMonthStart.getUTCFullYear() - 1,
      month: null,
    };
  }

  const explicitMonth = parseExplicitMonthPeriod(periodValue);
  if (explicitMonth) {
    return {
      granularity: "month",
      periodSpecifier: "month",
      year: explicitMonth.year,
      month: explicitMonth.month,
    };
  }

  const explicitYear = parseExplicitYearPeriod(periodValue);
  if (explicitYear) {
    return {
      granularity: "year",
      periodSpecifier: "year",
      year: explicitYear.year,
      month: null,
    };
  }

  return normalizePeriodBase({ periodValue: DEFAULT_PERIOD_VALUE, now });
}

function clampExplicitSelectionToBounds(args: {
  base: NormalizedPeriodBase;
  now: Date;
  firstBookingDate: Date | null;
}): NormalizedPeriodBase {
  const { base, now, firstBookingDate } = args;

  if (base.periodSpecifier !== "month" && base.periodSpecifier !== "year") {
    return base;
  }

  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const firstBookingDay = firstBookingDate
    ? startOfUtcDay(firstBookingDate)
    : null;

  if (base.granularity === "month") {
    const month = base.month ?? 0;
    const monthIndex = base.year * 12 + month;
    const minMonthIndex = firstBookingDay
      ? firstBookingDay.getUTCFullYear() * 12 + firstBookingDay.getUTCMonth()
      : monthIndex;
    const maxMonthIndex = currentYear * 12 + currentMonth;

    const clampedMonthIndex = Math.min(
      Math.max(monthIndex, minMonthIndex),
      maxMonthIndex,
    );
    const clampedYear = Math.floor(clampedMonthIndex / 12);
    const clampedMonth = clampedMonthIndex % 12;

    return {
      ...base,
      year: clampedYear,
      month: clampedMonth,
    };
  }

  const minYear = firstBookingDay
    ? firstBookingDay.getUTCFullYear()
    : base.year;
  return {
    ...base,
    year: Math.min(Math.max(base.year, minYear), currentYear),
  };
}

function buildPeriodLabel(base: NormalizedPeriodBase): string {
  if (base.granularity === "month") {
    const month = base.month ?? 0;
    return `${MONTH_NAMES[month]} ${base.year}`;
  }

  return String(base.year);
}

export function resolvePeriodSelection(args: {
  periodValue: string;
  now?: Date;
  firstBookingDate?: Date | null;
}): NormalizedPeriodSelection {
  const now = startOfUtcDay(args.now ?? new Date());
  const normalizedPeriodValue = normalizePeriodValue(args.periodValue);
  const base = clampExplicitSelectionToBounds({
    base: normalizePeriodBase({ periodValue: normalizedPeriodValue, now }),
    now,
    firstBookingDate: args.firstBookingDate ?? null,
  });

  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const firstBookingDate = args.firstBookingDate
    ? startOfUtcDay(args.firstBookingDate)
    : null;

  const year = base.year;
  const month = base.month;

  let from: Date;
  let to: Date;

  if (base.granularity === "month") {
    const monthIndex = month ?? 0;
    from = new Date(Date.UTC(year, monthIndex, 1));
    const isCurrentMonth = year === currentYear && monthIndex === currentMonth;
    to = isCurrentMonth ? addUtcDays(now, -1) : endOfUtcMonth(year, monthIndex);
  } else {
    const startMonth =
      firstBookingDate && year === firstBookingDate.getUTCFullYear()
        ? firstBookingDate.getUTCMonth()
        : 0;
    from = new Date(Date.UTC(year, startMonth, 1));
    const isCurrentYear = year === currentYear;
    to = isCurrentYear ? addUtcDays(now, -1) : endOfUtcYear(year);
  }

  const periodValue =
    base.granularity === "month"
      ? formatMonthPeriodValue(base.year, base.month ?? 0)
      : String(base.year).padStart(4, "0");

  return {
    periodValue:
      base.periodSpecifier === "month" || base.periodSpecifier === "year"
        ? periodValue
        : base.periodSpecifier,
    periodSpecifier: base.periodSpecifier,
    granularity: base.granularity,
    year: base.year,
    month: base.granularity === "month" ? (base.month ?? 0) : null,
    from,
    to,
    label: buildPeriodLabel(base),
  };
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
  return booking.symbol ? `security:${booking.symbol.toUpperCase()}` : null;
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

async function getUnitToReferenceExchangeRate(
  args: RateLookupInput,
): Promise<number | null> {
  const { unit, referenceCurrency, exchangeRateByKey } = args;
  const dateKey = toDateKey(args.date);

  if (unit === Unit.CURRENCY) {
    if (!args.currency) return null;
    const sourceCurrency = args.currency.toUpperCase();
    if (sourceCurrency === referenceCurrency) {
      return 1;
    }

    const cacheKey = `currency:${sourceCurrency}:${referenceCurrency}:${dateKey}`;
    const existingPromise = exchangeRateByKey.get(cacheKey);
    const exchangeRatePromise =
      existingPromise ??
      getCurrencyExchangeRate({
        sourceCurrency,
        targetCurrency: referenceCurrency,
        date: args.date,
      });

    if (!existingPromise) {
      exchangeRateByKey.set(cacheKey, exchangeRatePromise);
    }

    return exchangeRatePromise;
  }

  if (unit === Unit.CRYPTOCURRENCY) {
    if (!args.cryptocurrency) return null;

    const cryptocurrency = args.cryptocurrency.toUpperCase();
    const cacheKey = `crypto:${cryptocurrency}:${referenceCurrency}:${dateKey}`;
    const existingPromise = exchangeRateByKey.get(cacheKey);
    const exchangeRatePromise =
      existingPromise ??
      getCryptocurrencyToCurrencyExchangeRate({
        cryptocurrency,
        targetCurrency: referenceCurrency,
        date: args.date,
      });

    if (!existingPromise) {
      exchangeRateByKey.set(cacheKey, exchangeRatePromise);
    }

    return exchangeRatePromise;
  }

  if (!args.symbol || !args.tradeCurrency) return null;

  const symbol = args.symbol.toUpperCase();
  const tradeCurrency = args.tradeCurrency.toUpperCase();
  const cacheKey = `security:${symbol}:${tradeCurrency}:${referenceCurrency}:${dateKey}`;
  const existingPromise = exchangeRateByKey.get(cacheKey);
  const exchangeRatePromise =
    existingPromise ??
    getSecurityToCurrencyExchangeRate({
      symbol,
      tradeCurrency,
      targetCurrency: referenceCurrency,
      date: args.date,
    });

  if (!existingPromise) {
    exchangeRateByKey.set(cacheKey, exchangeRatePromise);
  }

  return exchangeRatePromise;
}

async function convertBookingValueToReference(args: {
  value: number;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
  referenceCurrency: string;
  exchangeRateByKey: Map<string, Promise<number | null>>;
}): Promise<number | null> {
  if (args.value === 0) {
    return 0;
  }

  const exchangeRatePromise =
    args.unit === Unit.CURRENCY &&
    args.currency?.toUpperCase() === args.referenceCurrency
      ? ONE_EXCHANGE_RATE_PROMISE
      : getUnitToReferenceExchangeRate({
          unit: args.unit,
          currency: args.currency,
          cryptocurrency: args.cryptocurrency,
          symbol: args.symbol,
          tradeCurrency: args.tradeCurrency,
          date: args.date,
          referenceCurrency: args.referenceCurrency,
          exchangeRateByKey: args.exchangeRateByKey,
        });

  const exchangeRate = await exchangeRatePromise;
  if (exchangeRate == null) {
    return null;
  }

  return args.value * exchangeRate;
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
    gainLoss += -(balance * rateDiff);
    balance += event.balanceDelta;
    previousRate = event.rate;
  }

  return gainLoss;
}

function buildAvailableYears(args: {
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

function sortHoldingEventsAscending(events: HoldingEvent[]): HoldingEvent[] {
  return [...events].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function getHoldingEventDateMap(args: {
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

export const getPeriodOverview = createServerFn({
  method: "GET",
})
  .inputValidator((data: { accountBookId: string; period?: unknown }) => ({
    accountBookId: data.accountBookId,
    period: normalizePeriodValue(data.period),
  }))
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const accountBook = await prisma.accountBook.findUniqueOrThrow({
      where: { id: data.accountBookId },
      select: {
        referenceCurrency: true,
      },
    });

    const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
    const [minBookingDateAggregate, allAccountGroups, holdingAccounts] =
      await Promise.all([
        prisma.booking.aggregate({
          where: { accountBookId: data.accountBookId },
          _min: { date: true },
        }),
        prisma.accountGroup.findMany({
          where: { accountBookId: data.accountBookId },
          select: {
            id: true,
            name: true,
            parentGroupId: true,
          },
        }),
        prisma.account.findMany({
          where: {
            accountBookId: data.accountBookId,
            type: {
              in: [AccountType.ASSET, AccountType.LIABILITY],
            },
            NOT: {
              unit: Unit.CURRENCY,
              currency: referenceCurrency,
            },
          },
          select: {
            id: true,
            unit: true,
            currency: true,
            cryptocurrency: true,
            symbol: true,
            tradeCurrency: true,
          },
        }),
      ]);

    const holdingAccountsResolved = filterConvertibleHoldingAccounts(
      holdingAccounts,
      referenceCurrency,
    );

    const firstBookingDate = minBookingDateAggregate._min.date
      ? startOfUtcDay(minBookingDateAggregate._min.date)
      : null;

    const selection = resolvePeriodSelection({
      periodValue: data.period,
      now: new Date(),
      firstBookingDate,
    });

    const queryStart = selection.from;
    const queryEndExclusive = addUtcDays(startOfUtcDay(selection.to), 1);
    const initialHoldingDate = addUtcDays(queryStart, -1);

    const groupById = new Map(
      allAccountGroups.map((group) => [group.id, group]),
    );

    const exchangeRateByKey = new Map<string, Promise<number | null>>();

    let bookingsCount = 0;
    let convertedBookingsCount = 0;
    let skippedBookingsCount = 0;

    let totalIncome = 0;
    let totalExpenses = 0;
    let explicitGainLoss = 0;

    const expenseAmountByBucketId = new Map<
      string,
      ExpenseBreakdownAccumulatorItem
    >();

    let nextBookingIdCursor: string | undefined;

    while (true) {
      const bookingsPage = await prisma.booking.findMany({
        where: {
          accountBookId: data.accountBookId,
          date: {
            gte: queryStart,
            lt: queryEndExclusive,
          },
          account: {
            type: AccountType.EQUITY,
            equityAccountSubtype: {
              in: [
                EquityAccountSubtype.INCOME,
                EquityAccountSubtype.EXPENSE,
                EquityAccountSubtype.GAIN_LOSS,
              ],
            },
          },
        },
        orderBy: { id: "asc" },
        take: EQUITY_BOOKINGS_PAGE_SIZE,
        ...(nextBookingIdCursor
          ? {
              cursor: {
                id_accountBookId: {
                  id: nextBookingIdCursor,
                  accountBookId: data.accountBookId,
                },
              },
              skip: 1,
            }
          : {}),
        select: {
          id: true,
          date: true,
          value: true,
          unit: true,
          currency: true,
          cryptocurrency: true,
          symbol: true,
          tradeCurrency: true,
          account: {
            select: {
              id: true,
              name: true,
              groupId: true,
              equityAccountSubtype: true,
            },
          },
        },
      });

      if (bookingsPage.length === 0) {
        break;
      }

      bookingsCount += bookingsPage.length;
      nextBookingIdCursor = bookingsPage[bookingsPage.length - 1].id;

      for (const booking of bookingsPage) {
        const convertedValue = await convertBookingValueToReference({
          value: Number(booking.value),
          unit: booking.unit,
          currency: booking.currency,
          cryptocurrency: booking.cryptocurrency,
          symbol: booking.symbol,
          tradeCurrency: booking.tradeCurrency,
          date: booking.date,
          referenceCurrency,
          exchangeRateByKey,
        });

        if (convertedValue == null) {
          skippedBookingsCount += 1;
          continue;
        }

        convertedBookingsCount += 1;

        if (
          booking.account.equityAccountSubtype === EquityAccountSubtype.INCOME
        ) {
          totalIncome += -convertedValue;
        } else if (
          booking.account.equityAccountSubtype === EquityAccountSubtype.EXPENSE
        ) {
          totalExpenses += convertedValue;

          const expenseBucket = createExpenseBucket({
            accountId: booking.account.id,
            accountName: booking.account.name,
            groupId: booking.account.groupId,
            groupById,
          });

          const existingBucket = expenseAmountByBucketId.get(expenseBucket.id);
          if (existingBucket) {
            existingBucket.amount += convertedValue;
          } else {
            expenseAmountByBucketId.set(expenseBucket.id, {
              id: expenseBucket.id,
              label: expenseBucket.label,
              kind: expenseBucket.kind,
              amount: convertedValue,
            });
          }
        } else {
          explicitGainLoss += convertedValue;
        }
      }

      if (bookingsPage.length < EQUITY_BOOKINGS_PAGE_SIZE) {
        break;
      }
    }

    let transactionGainLoss = 0;
    let nextTransactionIdCursor: string | undefined;

    while (true) {
      const transactionsPage = await prisma.transaction.findMany({
        where: {
          accountBookId: data.accountBookId,
          AND: [
            {
              bookings: {
                some: {
                  date: {
                    gte: queryStart,
                    lt: queryEndExclusive,
                  },
                },
              },
            },
            {
              bookings: {
                none: {
                  date: {
                    gte: queryEndExclusive,
                  },
                },
              },
            },
          ],
        },
        orderBy: { id: "asc" },
        take: TRANSACTIONS_PAGE_SIZE,
        ...(nextTransactionIdCursor
          ? {
              cursor: {
                id_accountBookId: {
                  id: nextTransactionIdCursor,
                  accountBookId: data.accountBookId,
                },
              },
              skip: 1,
            }
          : {}),
        select: {
          id: true,
          bookings: {
            select: {
              date: true,
              value: true,
              unit: true,
              currency: true,
              cryptocurrency: true,
              symbol: true,
              tradeCurrency: true,
            },
            orderBy: [{ date: "asc" }, { id: "asc" }],
          },
        },
      });

      if (transactionsPage.length === 0) {
        break;
      }

      nextTransactionIdCursor =
        transactionsPage[transactionsPage.length - 1].id;

      for (const transaction of transactionsPage) {
        if (!isMultiUnitTransaction(transaction.bookings)) {
          continue;
        }

        if (
          !shouldIncludeTransactionForPeriod({
            bookingDates: transaction.bookings.map((booking) => booking.date),
            periodStart: queryStart,
            periodEndExclusive: queryEndExclusive,
          })
        ) {
          continue;
        }

        let transactionContribution = 0;
        let transactionConvertible = true;

        for (const booking of transaction.bookings) {
          const convertedValue = await convertBookingValueToReference({
            value: Number(booking.value),
            unit: booking.unit,
            currency: booking.currency,
            cryptocurrency: booking.cryptocurrency,
            symbol: booking.symbol,
            tradeCurrency: booking.tradeCurrency,
            date: booking.date,
            referenceCurrency,
            exchangeRateByKey,
          });

          if (convertedValue == null) {
            transactionConvertible = false;
            skippedBookingsCount += 1;
            break;
          }

          convertedBookingsCount += 1;
          transactionContribution += convertedValue;
        }

        if (!transactionConvertible) {
          continue;
        }

        transactionGainLoss += transactionContribution;
      }

      if (transactionsPage.length < TRANSACTIONS_PAGE_SIZE) {
        break;
      }
    }

    const holdingAccountIds = holdingAccountsResolved.map(
      (account) => account.id,
    );

    let holdingGainLoss = 0;

    if (holdingAccountIds.length > 0) {
      const [initialHoldingBalances, holdingBookingsInPeriod] =
        await Promise.all([
          prisma.booking.groupBy({
            by: ["accountId"],
            where: {
              accountBookId: data.accountBookId,
              accountId: { in: holdingAccountIds },
              date: { lte: initialHoldingDate },
            },
            _sum: { value: true },
          }),
          prisma.booking.findMany({
            where: {
              accountBookId: data.accountBookId,
              accountId: { in: holdingAccountIds },
              date: {
                gte: queryStart,
                lt: queryEndExclusive,
              },
            },
            orderBy: [{ accountId: "asc" }, { date: "asc" }, { id: "asc" }],
            select: {
              accountId: true,
              date: true,
              value: true,
            },
          }),
        ]);

      const initialHoldingBalanceByAccountId = new Map(
        initialHoldingBalances.map((balance) => [
          balance.accountId,
          Number(balance._sum.value ?? 0),
        ]),
      );

      const holdingBookingsByAccountId = new Map<
        string,
        Array<{ date: Date; value: number }>
      >();

      for (const booking of holdingBookingsInPeriod) {
        const existing = holdingBookingsByAccountId.get(booking.accountId);
        const normalizedBooking = {
          date: startOfUtcDay(booking.date),
          value: Number(booking.value),
        };

        if (existing) {
          existing.push(normalizedBooking);
        } else {
          holdingBookingsByAccountId.set(booking.accountId, [
            normalizedBooking,
          ]);
        }
      }

      for (const account of holdingAccountsResolved) {
        const initialBalance =
          initialHoldingBalanceByAccountId.get(account.id) ?? 0;
        const periodBookings = holdingBookingsByAccountId.get(account.id) ?? [];

        if (initialBalance === 0 && periodBookings.length === 0) {
          continue;
        }

        const initialRate = await getUnitToReferenceExchangeRate({
          unit: account.unit,
          currency: account.currency,
          cryptocurrency: account.cryptocurrency,
          symbol: account.symbol,
          tradeCurrency: account.tradeCurrency,
          date: initialHoldingDate,
          referenceCurrency,
          exchangeRateByKey,
        });

        if (initialRate == null) {
          skippedBookingsCount += 1;
          continue;
        }

        const holdingEventDateMap = getHoldingEventDateMap({
          bookings: periodBookings,
          periodEnd: selection.to,
        });

        const sortedEvents = sortHoldingEventsAscending(
          Array.from(holdingEventDateMap.values()),
        );

        const eventsForSeries: HoldingGainLossSeriesEvent[] = [];
        let accountConvertible = true;

        for (const event of sortedEvents) {
          const eventRate = await getUnitToReferenceExchangeRate({
            unit: account.unit,
            currency: account.currency,
            cryptocurrency: account.cryptocurrency,
            symbol: account.symbol,
            tradeCurrency: account.tradeCurrency,
            date: event.date,
            referenceCurrency,
            exchangeRateByKey,
          });

          if (eventRate == null) {
            skippedBookingsCount += 1;
            accountConvertible = false;
            break;
          }

          eventsForSeries.push({
            rate: eventRate,
            balanceDelta: event.balanceDelta,
          });
        }

        if (!accountConvertible) {
          continue;
        }

        holdingGainLoss += computeHoldingGainLossForEventSeries({
          initialBalance,
          initialRate,
          events: eventsForSeries,
        });
      }
    }

    const gainsLosses =
      explicitGainLoss + transactionGainLoss + holdingGainLoss;
    const savings = totalIncome - totalExpenses;
    const totalReturn = savings + gainsLosses;

    const expenseBreakdown = buildExpenseBreakdownItems(
      Array.from(expenseAmountByBucketId.values()),
    );

    const currentDay = startOfUtcDay(new Date());
    const availableYears = buildAvailableYears({
      firstBookingDate,
      now: currentDay,
    });

    return {
      selectedPeriodValue: selection.periodValue,
      selectedPeriodSpecifier: selection.periodSpecifier,
      selectedPeriodLabel: selection.label,
      selectedGranularity: selection.granularity,
      selectedYear: selection.year,
      selectedMonth: selection.month,
      periodDateRange: {
        from: selection.from.toISOString(),
        to: selection.to.toISOString(),
      },
      minBookingDate: firstBookingDate?.toISOString() ?? null,
      maxDate: currentDay.toISOString(),
      availableYears,
      currentMonthValue: formatMonthPeriodValue(
        currentDay.getUTCFullYear(),
        currentDay.getUTCMonth(),
      ),
      currentYearValue: String(currentDay.getUTCFullYear()),
      referenceCurrency,
      bookingsCount,
      convertedBookingsCount,
      skippedBookingsCount,
      stats: {
        totalReturn: round2(totalReturn),
        savings: round2(savings),
        totalIncome: round2(totalIncome),
        totalExpenses: round2(totalExpenses),
        gainsLosses: round2(gainsLosses),
        explicitGainLoss: round2(explicitGainLoss),
        transactionGainLoss: round2(transactionGainLoss),
        holdingGainLoss: round2(holdingGainLoss),
      },
      expenseBreakdown: {
        totalAmount: expenseBreakdown.totalAmount,
        items: expenseBreakdown.items,
      },
    };
  });

function filterConvertibleHoldingAccounts(
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
