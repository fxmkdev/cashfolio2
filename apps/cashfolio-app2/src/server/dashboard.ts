import { createServerFn } from "@tanstack/react-start";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { ensureAuthorizedForAccountBookId } from "../account-books/functions.server";
import { prisma } from "../prisma.server";
import {
  DASHBOARD_NO_BOOKINGS_MESSAGE_BY_PERIOD,
  DASHBOARD_PERIOD_10Y,
  DASHBOARD_PERIOD_LABEL_BY_PERIOD,
  DEFAULT_DASHBOARD_PERIOD,
  isDashboardPeriod,
  type DashboardPeriod,
} from "../shared/dashboard-period";
import {
  getCryptocurrencyToCurrencyExchangeRate,
  getCurrencyExchangeRate,
  getSecurityToCurrencyExchangeRate,
import { getAccountTreeData } from "./accounts";
import { buildAssetAllocationFromTreeRows } from "./dashboard-asset-allocation";
} from "./valuation.server";

type DashboardBucket = {
  income: number;
  expense: number;
};

type DashboardPeriodConfig = {
  periodLabel: (typeof DASHBOARD_PERIOD_LABEL_BY_PERIOD)[DashboardPeriod];
  noBookingsMessage: (typeof DASHBOARD_NO_BOOKINGS_MESSAGE_BY_PERIOD)[DashboardPeriod];
  queryStart: Date;
  queryEndExclusive: Date;
  bucketStarts: Date[];
  toBucketKey: (date: Date) => string;
  getBucketLabel: (date: Date) => string;
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const ONE_EXCHANGE_RATE_PROMISE: Promise<number | null> = Promise.resolve(1);
const DASHBOARD_BOOKINGS_PAGE_SIZE = 1_000;

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getUtcMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfUtcYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function addUtcMonths(date: Date, amount: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1),
  );
}

function addUtcYears(date: Date, amount: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + amount, 0, 1));
}

function getUtcMonthLabel(date: Date): string {
  return `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function getUtcYearKey(date: Date): string {
  return String(date.getUTCFullYear());
}

function getUtcYearLabel(date: Date): string {
  return String(date.getUTCFullYear());
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getDashboardPeriodConfig(
  period: DashboardPeriod,
  now: Date,
): DashboardPeriodConfig {
  const currentMonthStart = startOfUtcMonth(now);

  if (period === DASHBOARD_PERIOD_10Y) {
    const currentYearStart = startOfUtcYear(now);
    const startYear = currentYearStart.getUTCFullYear() - 9;
    const queryStart = new Date(Date.UTC(startYear, 0, 1));
    const queryEndExclusive = now;
    const bucketStarts = Array.from({ length: 10 }, (_, index) =>
      addUtcYears(queryStart, index),
    );

    return {
      periodLabel: DASHBOARD_PERIOD_LABEL_BY_PERIOD[period],
      noBookingsMessage: DASHBOARD_NO_BOOKINGS_MESSAGE_BY_PERIOD[period],
      queryStart,
      queryEndExclusive,
      bucketStarts,
      toBucketKey: getUtcYearKey,
      getBucketLabel: getUtcYearLabel,
    };
  }

  const queryStart = addUtcMonths(currentMonthStart, -11);
  const queryEndExclusive = addUtcMonths(currentMonthStart, 1);
  const bucketStarts: Date[] = Array.from({ length: 12 }, (_, index) =>
    addUtcMonths(queryStart, index),
  );

  return {
    periodLabel: DASHBOARD_PERIOD_LABEL_BY_PERIOD[period],
    noBookingsMessage: DASHBOARD_NO_BOOKINGS_MESSAGE_BY_PERIOD[period],
    queryStart,
    queryEndExclusive,
    bucketStarts,
    toBucketKey: getUtcMonthKey,
    getBucketLabel: getUtcMonthLabel,
  };
}

export const getDashboardIncomeExpenseOverview = createServerFn({
  method: "GET",
})
  .inputValidator((data: { accountBookId: string; period: unknown }) => ({
    accountBookId: data.accountBookId,
    period: isDashboardPeriod(data.period)
      ? data.period
      : DEFAULT_DASHBOARD_PERIOD,
  }))
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const periodConfig = getDashboardPeriodConfig(data.period, new Date());
    const assetTreeData = await getAccountTreeData({
      data: {
        accountBookId: data.accountBookId,
        type: AccountType.ASSET,
        accountState: "active",
        includeReferenceBalances: true,
        includeActionAvailability: false,
      },
    });

    const referenceCurrency = assetTreeData.referenceCurrency;
    const assetAllocation = buildAssetAllocationFromTreeRows({
      rows: assetTreeData.rows,
      referenceCurrency,
    });
    const bucketsByKey = new Map<string, DashboardBucket>();

    for (const bucketStart of periodConfig.bucketStarts) {
      const bucketKey = periodConfig.toBucketKey(bucketStart);
      bucketsByKey.set(bucketKey, {
        income: 0,
        expense: 0,
      });
    }

    const exchangeRateByKey = new Map<string, Promise<number | null>>();
    let bookingsCount = 0;
    let skippedBookingsCount = 0;
    let convertedBookingsCount = 0;
    let nextBookingIdCursor: string | undefined;

    while (true) {
      const bookingsPage = await prisma.booking.findMany({
        where: {
          accountBookId: data.accountBookId,
          date: {
            gte: periodConfig.queryStart,
            lt: periodConfig.queryEndExclusive,
          },
          account: {
            type: AccountType.EQUITY,
            equityAccountSubtype: {
              in: [EquityAccountSubtype.INCOME, EquityAccountSubtype.EXPENSE],
            },
          },
        },
        orderBy: { id: "asc" },
        take: DASHBOARD_BOOKINGS_PAGE_SIZE,
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
            select: { equityAccountSubtype: true },
          },
        },
      });

      if (bookingsPage.length === 0) {
        break;
      }

      bookingsCount += bookingsPage.length;
      nextBookingIdCursor = bookingsPage[bookingsPage.length - 1].id;

      const conversionTasks: Array<{
        booking: (typeof bookingsPage)[number];
        bucket: DashboardBucket;
        exchangeRatePromise: Promise<number | null>;
      }> = [];

      for (const booking of bookingsPage) {
        const bucketKey = periodConfig.toBucketKey(booking.date);
        const bucket = bucketsByKey.get(bucketKey);
        if (!bucket) {
          continue;
        }

        const dateKey = toDateKey(booking.date);
        let exchangeRatePromise: Promise<number | null> | undefined;

        if (booking.unit === Unit.CURRENCY) {
          if (!booking.currency) {
            skippedBookingsCount += 1;
            continue;
          }

          const sourceCurrency = booking.currency.toUpperCase();
          if (sourceCurrency === referenceCurrency) {
            exchangeRatePromise = ONE_EXCHANGE_RATE_PROMISE;
          } else {
            const cacheKey = `currency:${sourceCurrency}:${referenceCurrency}:${dateKey}`;
            const existingPromise = exchangeRateByKey.get(cacheKey);
            exchangeRatePromise =
              existingPromise ??
              getCurrencyExchangeRate({
                sourceCurrency,
                targetCurrency: referenceCurrency,
                date: booking.date,
              });
            if (!existingPromise) {
              exchangeRateByKey.set(cacheKey, exchangeRatePromise);
            }
          }
        } else if (booking.unit === Unit.CRYPTOCURRENCY) {
          if (!booking.cryptocurrency) {
            skippedBookingsCount += 1;
            continue;
          }

          const cryptocurrency = booking.cryptocurrency.toUpperCase();
          const cacheKey = `crypto:${cryptocurrency}:${referenceCurrency}:${dateKey}`;
          const existingPromise = exchangeRateByKey.get(cacheKey);
          exchangeRatePromise =
            existingPromise ??
            getCryptocurrencyToCurrencyExchangeRate({
              cryptocurrency,
              targetCurrency: referenceCurrency,
              date: booking.date,
            });
          if (!existingPromise) {
            exchangeRateByKey.set(cacheKey, exchangeRatePromise);
          }
        } else if (booking.unit === Unit.SECURITY) {
          if (!booking.symbol || !booking.tradeCurrency) {
            skippedBookingsCount += 1;
            continue;
          }

          const symbol = booking.symbol.toUpperCase();
          const tradeCurrency = booking.tradeCurrency.toUpperCase();
          const cacheKey = `security:${symbol}:${tradeCurrency}:${referenceCurrency}:${dateKey}`;
          const existingPromise = exchangeRateByKey.get(cacheKey);
          exchangeRatePromise =
            existingPromise ??
            getSecurityToCurrencyExchangeRate({
              symbol,
              tradeCurrency,
              targetCurrency: referenceCurrency,
              date: booking.date,
            });
          if (!existingPromise) {
            exchangeRateByKey.set(cacheKey, exchangeRatePromise);
          }
        }

        if (!exchangeRatePromise) {
          skippedBookingsCount += 1;
          continue;
        }

        conversionTasks.push({ booking, bucket, exchangeRatePromise });
      }

      await Promise.all(
        Array.from(
          new Set(conversionTasks.map((task) => task.exchangeRatePromise)),
        ),
      );

      for (const task of conversionTasks) {
        const exchangeRate = await task.exchangeRatePromise;
        if (exchangeRate == null) {
          skippedBookingsCount += 1;
          continue;
        }
        convertedBookingsCount += 1;

        const rawConvertedValue = Number(task.booking.value) * exchangeRate;
        if (
          task.booking.account.equityAccountSubtype ===
          EquityAccountSubtype.INCOME
        ) {
          task.bucket.income += -rawConvertedValue;
        } else if (
          task.booking.account.equityAccountSubtype ===
          EquityAccountSubtype.EXPENSE
        ) {
          task.bucket.expense += rawConvertedValue;
        }
      }

      if (bookingsPage.length < DASHBOARD_BOOKINGS_PAGE_SIZE) {
        break;
      }
    }

    const points = periodConfig.bucketStarts.map((bucketStart) => {
      const bucketKey = periodConfig.toBucketKey(bucketStart);
      const bucket = bucketsByKey.get(bucketKey)!;
      const incomeSigned = round2(bucket.income);
      const expenseSigned = round2(bucket.expense);
      const income = round2(Math.abs(incomeSigned));
      const expense = round2(Math.abs(expenseSigned));
      const net = round2(incomeSigned - expenseSigned);

      return {
        bucketStart: bucketStart.toISOString(),
        bucketLabel: periodConfig.getBucketLabel(bucketStart),
        income,
        expense,
        net,
      };
    });

    return {
      periodLabel: periodConfig.periodLabel,
      noBookingsMessage: periodConfig.noBookingsMessage,
      referenceCurrency,
      bookingsCount,
      convertedBookingsCount,
      skippedBookingsCount,
      points,
      assetAllocation,
    };
  });
