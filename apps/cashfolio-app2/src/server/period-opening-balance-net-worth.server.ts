import { AccountType } from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import { addUtcDays, startOfUtcDay } from "../shared/date";
import { toMoneyNumber } from "../shared/money";
import { normalizePeriodValue } from "../shared/period";
import { computeEndOfPeriodBalanceStats } from "./period-balance-stats";
import { convertBookingValueToReference } from "./period-conversion";
import { buildTransferClearingVirtualHierarchy } from "./period-transfer-clearing";
import { loadTransferClearingUnitBuckets } from "./period-transfer-clearing-buckets";
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
  const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
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

  const transferClearingUnitBuckets = await loadTransferClearingUnitBuckets({
    accountBookId: args.accountBookId,
    periodEndExclusive: periodStart,
    referenceCurrency,
  });
  const {
    virtualAccounts: transferClearingVirtualAccounts,
    rawBalanceByVirtualAccountId,
  } = buildTransferClearingVirtualHierarchy({
    unitBuckets: transferClearingUnitBuckets,
  });
  for (const [accountId, rawBalance] of rawBalanceByVirtualAccountId) {
    rawBalanceByAccountId.set(accountId, rawBalance);
  }

  const exchangeRateByKey = new Map<string, Promise<number | null>>();
  const balanceStats = await computeEndOfPeriodBalanceStats({
    accounts: [...accounts, ...transferClearingVirtualAccounts],
    rawBalanceByAccountId,
    periodEnd: conversionDate,
    referenceCurrency,
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
