import { AccountType } from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import { addUtcDays } from "../shared/date";
import { computeEndOfPeriodBalanceStats } from "./period-balance-stats";
import { round2 } from "./period-helpers";
import { convertBookingValueToReference } from "./period-conversion";
import {
  buildTransferClearingVirtualHierarchy,
  loadTransferClearingUnitBuckets,
} from "./period-transfer-clearing";

export type TimelineOpeningBalancePoint = {
  date: string;
  label: string;
  assets: number;
  liabilities: number;
  netWorth: number;
};

export async function loadTimelineOpeningBalancePoint(args: {
  accountBookId: string;
  accountBookStartDate: Date;
  referenceCurrency: string;
}): Promise<TimelineOpeningBalancePoint> {
  const openingBalanceDate = addUtcDays(args.accountBookStartDate, -1);

  const [baseAssetLiabilityAccounts, endOfPeriodRawBalancesGrouped] =
    await Promise.all([
      prisma.account.findMany({
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
      }),
      prisma.booking.groupBy({
        by: ["accountId"],
        where: {
          accountBookId: args.accountBookId,
          account: {
            type: {
              in: [AccountType.ASSET, AccountType.LIABILITY],
            },
          },
          date: {
            lt: args.accountBookStartDate,
          },
        },
        _sum: {
          value: true,
        },
      }),
    ]);

  const transferClearingUnitBuckets = await loadTransferClearingUnitBuckets({
    accountBookId: args.accountBookId,
    periodEndExclusive: args.accountBookStartDate,
    referenceCurrency: args.referenceCurrency,
  });

  const endOfPeriodRawBalanceByAccountId = new Map(
    endOfPeriodRawBalancesGrouped.map((balance) => [
      balance.accountId,
      Number(balance._sum.value ?? 0),
    ]),
  );

  const { virtualAccounts, rawBalanceByVirtualAccountId } =
    buildTransferClearingVirtualHierarchy({
      unitBuckets: transferClearingUnitBuckets,
    });

  for (const [accountId, rawBalance] of rawBalanceByVirtualAccountId) {
    endOfPeriodRawBalanceByAccountId.set(accountId, rawBalance);
  }

  const exchangeRateByKey = new Map<string, Promise<number | null>>();
  const openingBalanceStats = await computeEndOfPeriodBalanceStats({
    accounts: [...baseAssetLiabilityAccounts, ...virtualAccounts],
    rawBalanceByAccountId: endOfPeriodRawBalanceByAccountId,
    periodEnd: openingBalanceDate,
    referenceCurrency: args.referenceCurrency,
    convertBalanceToReference: (input) =>
      convertBookingValueToReference({
        ...input,
        exchangeRateByKey,
      }),
  });

  return {
    date: openingBalanceDate.toISOString(),
    label: "Opening Balance",
    assets: round2(openingBalanceStats.assets),
    liabilities: round2(openingBalanceStats.liabilities),
    netWorth: round2(openingBalanceStats.netWorth),
  };
}
