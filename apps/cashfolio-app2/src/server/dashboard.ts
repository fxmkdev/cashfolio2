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
} from "./fx.server";

type DashboardBucket = {
  income: number;
  expense: number;
};

type DashboardPeriod = "12m" | "10y";

type DashboardPeriodConfig = {
  periodLabel: "Last 12 months" | "Last 10 years";
  noBookingsMessage: string;
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

  if (period === "10y") {
    const currentYearStart = startOfUtcYear(now);
    const startYear = currentYearStart.getUTCFullYear() - 9;
    const queryStart = new Date(Date.UTC(startYear, 0, 1));
    const queryEndExclusive = addUtcMonths(currentMonthStart, 1);
    const bucketStarts = Array.from({ length: 10 }, (_, index) =>
      addUtcYears(queryStart, index),
    );

    return {
      periodLabel: "Last 10 years",
      noBookingsMessage:
        "No income or expense bookings found in the last 10 years.",
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
    periodLabel: "Last 12 months",
    noBookingsMessage:
      "No income or expense bookings found in the last 12 months.",
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
  .inputValidator(
    (data: { accountBookId: string; period: DashboardPeriod }) => data,
  )
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const periodConfig = getDashboardPeriodConfig(data.period, new Date());

    const [accountBook, bookings] = await Promise.all([
      prisma.accountBook.findUniqueOrThrow({
        where: { id: data.accountBookId },
        select: { referenceCurrency: true },
      }),
      prisma.booking.findMany({
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
        select: {
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
      }),
    ]);

    const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
    const bucketsByKey = new Map<string, DashboardBucket>();

    for (const bucketStart of periodConfig.bucketStarts) {
      const bucketKey = periodConfig.toBucketKey(bucketStart);
      bucketsByKey.set(bucketKey, {
        income: 0,
        expense: 0,
      });
    }

    const exchangeRateByKey = new Map<string, Promise<number | null>>();
    const conversionTasks: Array<{
      booking: (typeof bookings)[number];
      bucket: DashboardBucket;
      exchangeRatePromise: Promise<number | null>;
    }> = [];
    let skippedBookingsCount = 0;
    let convertedBookingsCount = 0;

    for (const booking of bookings) {
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
      bookingsCount: bookings.length,
      convertedBookingsCount,
      skippedBookingsCount,
      points,
    };
  });
