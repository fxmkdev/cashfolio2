import { createServerFn } from "@tanstack/react-start";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { prisma } from "../prisma.server";
import {
  DEFAULT_PERIOD_VALUE,
  formatMonthPeriodValue,
  isSupportedPeriodValue,
  normalizePeriodValue,
  parseExplicitMonthPeriod,
  parseExplicitYearPeriod,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_VALUES,
  PERIOD_PRESET_YTD,
  type PeriodPresetValue,
} from "../shared/period";
import {
  buildAvailableYears,
  buildBreakdownHierarchy,
  buildBreakdownHierarchyWithMeta,
  buildBreakdownItems,
  computeHoldingGainLossForEventSeries,
  createBreakdownBucket,
  filterConvertibleHoldingAccounts,
  getHoldingEventDateMap,
  isMultiUnitTransaction,
  round2,
  shouldIncludeTransactionForPeriod,
  sortHoldingEventsAscending,
  type BreakdownHierarchyAccumulatorItem,
  type HoldingGainLossSeriesEvent,
} from "./period-helpers";
import {
  convertBookingValueToReference,
  getUnitToReferenceExchangeRate,
} from "./period-conversion";

export {
  DEFAULT_PERIOD_VALUE,
  isSupportedPeriodValue,
  normalizePeriodValue,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_VALUES,
  PERIOD_PRESET_YTD,
};
export type { PeriodPresetValue };
export {
  buildBreakdownHierarchy,
  buildBreakdownItems,
  computeHoldingGainLossForEventSeries,
  createBreakdownBucket,
  isMultiUnitTransaction,
  shouldIncludeTransactionForPeriod,
};

export type PeriodSpecifier = PeriodPresetValue | "month" | "year";

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

const EQUITY_BOOKINGS_PAGE_SIZE = 1_000;
const TRANSACTIONS_PAGE_SIZE = 200;

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
  firstBookingDate: Date | null | undefined;
}): NormalizedPeriodBase {
  const { base, now, firstBookingDate } = args;

  if (base.periodSpecifier !== "month" && base.periodSpecifier !== "year") {
    return base;
  }

  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const hasNoBookings = firstBookingDate === null;
  const firstBookingDay = firstBookingDate
    ? startOfUtcDay(firstBookingDate)
    : null;

  if (base.granularity === "month") {
    const month = base.month ?? 0;
    const monthIndex = base.year * 12 + month;
    const minMonthIndex = firstBookingDay
      ? firstBookingDay.getUTCFullYear() * 12 + firstBookingDay.getUTCMonth()
      : hasNoBookings
        ? currentYear * 12 + currentMonth
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
    : hasNoBookings
      ? currentYear
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
  const firstBookingDateForClamping =
    args.firstBookingDate === undefined
      ? undefined
      : args.firstBookingDate
        ? startOfUtcDay(args.firstBookingDate)
        : null;
  const base = clampExplicitSelectionToBounds({
    base: normalizePeriodBase({ periodValue: normalizedPeriodValue, now }),
    now,
    firstBookingDate: firstBookingDateForClamping,
  });

  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const firstBookingDate = firstBookingDateForClamping ?? null;

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

  if (to < from) {
    to = from;
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

    const expenseAmountByAccountId = new Map<
      string,
      BreakdownHierarchyAccumulatorItem
    >();
    const incomeAmountByAccountId = new Map<
      string,
      BreakdownHierarchyAccumulatorItem
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

      const conversionTasks = bookingsPage.map((booking) => ({
        booking,
        convertedValuePromise: convertBookingValueToReference({
          value: Number(booking.value),
          unit: booking.unit,
          currency: booking.currency,
          cryptocurrency: booking.cryptocurrency,
          symbol: booking.symbol,
          tradeCurrency: booking.tradeCurrency,
          date: booking.date,
          referenceCurrency,
          exchangeRateByKey,
        }),
      }));

      const convertedValues = await Promise.all(
        conversionTasks.map((task) => task.convertedValuePromise),
      );

      for (let index = 0; index < conversionTasks.length; index += 1) {
        const booking = conversionTasks[index]!.booking;
        const convertedValue = convertedValues[index];

        if (convertedValue == null) {
          skippedBookingsCount += 1;
          continue;
        }

        convertedBookingsCount += 1;

        if (
          booking.account.equityAccountSubtype === EquityAccountSubtype.INCOME
        ) {
          const incomeAmount = -convertedValue;
          totalIncome += incomeAmount;

          const existingItem = incomeAmountByAccountId.get(booking.account.id);
          if (existingItem) {
            existingItem.amount += incomeAmount;
          } else {
            incomeAmountByAccountId.set(booking.account.id, {
              accountId: booking.account.id,
              accountName: booking.account.name,
              groupId: booking.account.groupId,
              amount: incomeAmount,
            });
          }
        } else if (
          booking.account.equityAccountSubtype === EquityAccountSubtype.EXPENSE
        ) {
          const expenseAmount = convertedValue;
          totalExpenses += expenseAmount;

          const existingItem = expenseAmountByAccountId.get(booking.account.id);
          if (existingItem) {
            existingItem.amount += expenseAmount;
          } else {
            expenseAmountByAccountId.set(booking.account.id, {
              accountId: booking.account.id,
              accountName: booking.account.name,
              groupId: booking.account.groupId,
              amount: expenseAmount,
            });
          }
        } else {
          explicitGainLoss += -convertedValue;
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

      const multiUnitTransactions = transactionsPage.filter((transaction) =>
        isMultiUnitTransaction(transaction.bookings),
      );

      const convertedValuesPerTransaction = await Promise.all(
        multiUnitTransactions.map((transaction) =>
          Promise.all(
            transaction.bookings.map((booking) =>
              convertBookingValueToReference({
                value: Number(booking.value),
                unit: booking.unit,
                currency: booking.currency,
                cryptocurrency: booking.cryptocurrency,
                symbol: booking.symbol,
                tradeCurrency: booking.tradeCurrency,
                date: booking.date,
                referenceCurrency,
                exchangeRateByKey,
              }),
            ),
          ),
        ),
      );

      for (const convertedValues of convertedValuesPerTransaction) {
        const nonNullConvertedValues = convertedValues.filter(
          (convertedValue): convertedValue is number => convertedValue != null,
        );
        const failedConversionsCount =
          convertedValues.length - nonNullConvertedValues.length;

        if (failedConversionsCount > 0) {
          skippedBookingsCount += failedConversionsCount;
          continue;
        }

        convertedBookingsCount += nonNullConvertedValues.length;
        transactionGainLoss += nonNullConvertedValues.reduce(
          (sum, convertedValue) => sum + convertedValue,
          0,
        );
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
              date: { lt: queryStart },
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

      const holdingResults = await Promise.all(
        holdingAccountsResolved.map(async (account) => {
          const initialBalance =
            initialHoldingBalanceByAccountId.get(account.id) ?? 0;
          const periodBookings =
            holdingBookingsByAccountId.get(account.id) ?? [];

          if (initialBalance === 0 && periodBookings.length === 0) {
            return { skippedCount: 0, gainLossContribution: 0 };
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
            return { skippedCount: 1, gainLossContribution: 0 };
          }

          const holdingEventDateMap = getHoldingEventDateMap({
            bookings: periodBookings,
            periodEnd: selection.to,
          });

          const sortedEvents = sortHoldingEventsAscending(
            Array.from(holdingEventDateMap.values()),
          );

          const eventRatePromises = sortedEvents.map((event) =>
            getUnitToReferenceExchangeRate({
              unit: account.unit,
              currency: account.currency,
              cryptocurrency: account.cryptocurrency,
              symbol: account.symbol,
              tradeCurrency: account.tradeCurrency,
              date: event.date,
              referenceCurrency,
              exchangeRateByKey,
            }),
          );
          const eventRates = await Promise.all(eventRatePromises);
          const nonNullEventRates = eventRates.filter(
            (eventRate): eventRate is number => eventRate != null,
          );

          if (nonNullEventRates.length !== eventRates.length) {
            return { skippedCount: 1, gainLossContribution: 0 };
          }

          const eventsForSeries: HoldingGainLossSeriesEvent[] =
            sortedEvents.map((event, index) => ({
              rate: nonNullEventRates[index]!,
              balanceDelta: event.balanceDelta,
            }));

          return {
            skippedCount: 0,
            gainLossContribution: computeHoldingGainLossForEventSeries({
              initialBalance,
              initialRate,
              events: eventsForSeries,
            }),
          };
        }),
      );

      holdingGainLoss += holdingResults.reduce(
        (sum, result) => sum + result.gainLossContribution,
        0,
      );
      skippedBookingsCount += holdingResults.reduce(
        (sum, result) => sum + result.skippedCount,
        0,
      );
    }

    const gainsLosses =
      explicitGainLoss + transactionGainLoss + holdingGainLoss;
    const savings = totalIncome - totalExpenses;
    const totalReturn = savings + gainsLosses;

    const {
      hierarchy: expenseBreakdownHierarchy,
      hasHiddenAmountDiscrepancy: expenseBreakdownHasHiddenAmountDiscrepancy,
    } = buildBreakdownHierarchyWithMeta({
      items: Array.from(expenseAmountByAccountId.values()),
      groupById,
    });
    const {
      hierarchy: incomeBreakdownHierarchy,
      hasHiddenAmountDiscrepancy: incomeBreakdownHasHiddenAmountDiscrepancy,
    } = buildBreakdownHierarchyWithMeta({
      items: Array.from(incomeAmountByAccountId.values()),
      groupById,
    });
    const expenseBreakdown = buildBreakdownItems(
      expenseBreakdownHierarchy.map((node) => ({
        id: node.id,
        label: node.label,
        kind: node.kind,
        amount: node.amount,
      })),
    );
    const incomeBreakdown = buildBreakdownItems(
      incomeBreakdownHierarchy.map((node) => ({
        id: node.id,
        label: node.label,
        kind: node.kind,
        amount: node.amount,
      })),
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
        hierarchy: expenseBreakdownHierarchy,
        hasHiddenAmountDiscrepancy: expenseBreakdownHasHiddenAmountDiscrepancy,
      },
      incomeBreakdown: {
        totalAmount: incomeBreakdown.totalAmount,
        items: incomeBreakdown.items,
        hierarchy: incomeBreakdownHierarchy,
        hasHiddenAmountDiscrepancy: incomeBreakdownHasHiddenAmountDiscrepancy,
      },
    };
  });
