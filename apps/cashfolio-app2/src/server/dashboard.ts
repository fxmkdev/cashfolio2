import { createServerFn } from "@tanstack/react-start";
import { addMonths, format, startOfMonth, subMonths } from "date-fns";
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

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
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
    const currentMonthStart = startOfMonth(now);
    const periodStart = subMonths(currentMonthStart, 11);
    const periodEnd = addMonths(currentMonthStart, 1);

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
      addMonths(periodStart, index),
    );

    for (const monthStart of monthStarts) {
      const monthKey = format(monthStart, "yyyy-MM");
      bucketsByMonthKey.set(monthKey, {
        monthStart,
        income: 0,
        expense: 0,
      });
    }

    const exchangeRateByKey = new Map<string, Promise<number | null>>();
    let skippedBookingsCount = 0;

    for (const booking of bookings) {
      const monthKey = format(startOfMonth(booking.date), "yyyy-MM");
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
          exchangeRatePromise = Promise.resolve(1);
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

      const exchangeRate = await exchangeRatePromise;
      if (exchangeRate == null) {
        skippedBookingsCount += 1;
        continue;
      }

      const convertedMagnitude = Math.abs(Number(booking.value) * exchangeRate);
      if (
        booking.account.equityAccountSubtype === EquityAccountSubtype.INCOME
      ) {
        bucket.income += convertedMagnitude;
      } else if (
        booking.account.equityAccountSubtype === EquityAccountSubtype.EXPENSE
      ) {
        bucket.expense += convertedMagnitude;
      }
    }

    const points = monthStarts.map((monthStart) => {
      const monthKey = format(monthStart, "yyyy-MM");
      const bucket = bucketsByMonthKey.get(monthKey)!;
      const income = round2(bucket.income);
      const expense = round2(bucket.expense);
      const net = round2(income - expense);

      return {
        monthStart: monthStart.toISOString(),
        monthLabel: format(monthStart, "MMM yyyy"),
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
