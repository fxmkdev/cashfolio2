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
  monthStart: Date;
  income: number;
  expense: number;
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

function addUtcMonths(date: Date, amount: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1),
  );
}

function getUtcMonthLabel(date: Date): string {
  return `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const getDashboardIncomeExpenseOverview = createServerFn({
  method: "GET",
})
  .inputValidator((data: { accountBookId: string }) => data)
  .handler(async ({ data }) => {
    await ensureAuthorizedForAccountBookId(data.accountBookId);

    const now = new Date();
    const currentMonthStart = startOfUtcMonth(now);
    const periodStart = addUtcMonths(currentMonthStart, -11);
    const periodEnd = addUtcMonths(currentMonthStart, 1);

    const [accountBook, bookings] = await Promise.all([
      prisma.accountBook.findUniqueOrThrow({
        where: { id: data.accountBookId },
        select: { referenceCurrency: true },
      }),
      prisma.booking.findMany({
        where: {
          accountBookId: data.accountBookId,
          date: { gte: periodStart, lt: periodEnd },
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
    const bucketsByMonthKey = new Map<string, DashboardBucket>();
    const monthStarts: Date[] = Array.from({ length: 12 }, (_, index) =>
      addUtcMonths(periodStart, index),
    );

    for (const monthStart of monthStarts) {
      const monthKey = getUtcMonthKey(monthStart);
      bucketsByMonthKey.set(monthKey, {
        monthStart,
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

    for (const booking of bookings) {
      const monthKey = getUtcMonthKey(booking.date);
      const bucket = bucketsByMonthKey.get(monthKey);
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

    const points = monthStarts.map((monthStart) => {
      const monthKey = getUtcMonthKey(monthStart);
      const bucket = bucketsByMonthKey.get(monthKey)!;
      const incomeSigned = round2(bucket.income);
      const expenseSigned = round2(bucket.expense);
      const income = round2(Math.abs(incomeSigned));
      const expense = round2(Math.abs(expenseSigned));
      const net = round2(incomeSigned - expenseSigned);

      return {
        monthStart: monthStart.toISOString(),
        monthLabel: getUtcMonthLabel(monthStart),
        income,
        expense,
        net,
      };
    });

    return {
      periodLabel: "Last 12 months",
      referenceCurrency,
      skippedBookingsCount,
      points,
    };
  });
