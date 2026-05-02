import { AccountType } from "../.prisma-client/enums";
import { createServerFn } from "@tanstack/react-start";
import { prisma } from "../prisma.server";
import { addUtcDays, startOfUtcDay } from "../shared/date";
import { toMoneyNumber } from "../shared/money";
import { normalizePeriodValue } from "../shared/period";
import { computeEndOfPeriodBalanceStats } from "./period-balance-stats";
import { convertBookingValueToReference } from "./period-conversion";
import { resolvePeriodSelection } from "./period-selection";

export type OpeningBalanceNetWorthResult = {
  openingBalanceNetWorth: number;
  skippedCount: number;
  periodStart: string;
};

export async function loadOpeningBalanceNetWorthForPeriod(args: {
  accountBookId: string;
  period?: unknown;
}): Promise<OpeningBalanceNetWorthResult> {
  const normalizedPeriodValue = normalizePeriodValue(args.period);

  const accountBook = await prisma.accountBook.findUniqueOrThrow({
    where: {
      id: args.accountBookId,
    },
    select: {
      referenceCurrency: true,
      startDate: true,
    },
  });

  const accountBookStartDate = startOfUtcDay(accountBook.startDate);
  const selection = resolvePeriodSelection({
    periodValue: normalizedPeriodValue,
    now: new Date(),
    firstBookingDate: accountBookStartDate,
  });
  const periodStart = selection.from;
  const conversionDate = addUtcDays(periodStart, -1);

  const accounts = await prisma.account.findMany({
    where: {
      accountBookId: args.accountBookId,
      type: {
        in: [AccountType.ASSET, AccountType.LIABILITY],
      },
    },
    select: {
      id: true,
      type: true,
      unit: true,
      currency: true,
      cryptocurrency: true,
      symbol: true,
      tradeCurrency: true,
    },
  });

  const rawBalanceByAccountId = new Map<string, number>();
  if (accounts.length > 0) {
    const groupedBalances = await prisma.booking.groupBy({
      by: ["accountId"],
      where: {
        accountBookId: args.accountBookId,
        accountId: {
          in: accounts.map((account) => account.id),
        },
        date: {
          lt: periodStart,
        },
      },
      _sum: {
        value: true,
      },
    });

    for (const groupedBalance of groupedBalances) {
      rawBalanceByAccountId.set(
        groupedBalance.accountId,
        toMoneyNumber(groupedBalance._sum.value ?? 0),
      );
    }
  }

  const exchangeRateByKey = new Map<string, Promise<number | null>>();
  const balanceStats = await computeEndOfPeriodBalanceStats({
    accounts,
    rawBalanceByAccountId,
    periodEnd: conversionDate,
    referenceCurrency: accountBook.referenceCurrency,
    convertBalanceToReference: (input) =>
      convertBookingValueToReference({
        ...input,
        exchangeRateByKey,
      }),
  });

  return {
    openingBalanceNetWorth: balanceStats.netWorth,
    skippedCount: balanceStats.skippedCount,
    periodStart: periodStart.toISOString(),
  };
}

export const getOpeningBalanceNetWorthForPeriod = createServerFn({
  method: "GET",
})
  .inputValidator((data: { accountBookId: string; period?: unknown }) => ({
    accountBookId: data.accountBookId,
    period: normalizePeriodValue(data.period),
  }))
  .handler(async ({ data }) => {
    const { ensureAuthorizedForAccountBookId } =
      await import("../account-books/functions.server");

    await ensureAuthorizedForAccountBookId(data.accountBookId);

    return loadOpeningBalanceNetWorthForPeriod(data);
  });
