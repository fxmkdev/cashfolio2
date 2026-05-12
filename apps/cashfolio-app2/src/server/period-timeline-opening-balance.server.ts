import { AccountType } from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import { getOpeningBalancesBookingDate, startOfUtcDay } from "../shared/date";
import { toMoneyNumber } from "../shared/money";
import { computeEndOfPeriodBalanceStatsWithConvertedBalances } from "./period-balance-stats";
import { round2 } from "./period-helpers";
import { convertBookingValueToReference } from "./period-conversion";
import {
  buildTransferClearingVirtualHierarchy,
  loadTransferClearingUnitBuckets,
} from "./period-transfer-clearing";
import {
  buildBalanceTimelineScopeAmountMaps,
  resolveScopedMetricValue,
  type TimelineMetricScopeFilter,
} from "./period-timeline-scopes.server";

export type TimelineOpeningBalancePoint = {
  date: string;
  label: string;
  assets: number;
  liabilities: number;
  netWorth: number;
  scopedMetricValue?: number;
};

export async function loadTimelineOpeningBalancePoint(args: {
  accountBookId: string;
  accountBookStartDate: Date;
  referenceCurrency: string;
  metricScopeFilter?: TimelineMetricScopeFilter;
}): Promise<TimelineOpeningBalancePoint> {
  const accountBookStartDate = startOfUtcDay(args.accountBookStartDate);
  const openingBalanceDate =
    getOpeningBalancesBookingDate(accountBookStartDate);

  const [baseAssetLiabilityAccounts, accountGroups] = await Promise.all([
    prisma.account.findMany({
      where: {
        accountBookId: args.accountBookId,
        type: {
          in: [AccountType.ASSET, AccountType.LIABILITY],
        },
      },
      select: {
        id: true,
        name: true,
        groupId: true,
        type: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
      },
    }),
    prisma.accountGroup.findMany({
      where: { accountBookId: args.accountBookId },
      select: {
        id: true,
        name: true,
        parentGroupId: true,
      },
    }),
  ]);
  const baseAssetLiabilityAccountIds = baseAssetLiabilityAccounts.map(
    (account) => account.id,
  );
  const endOfPeriodRawBalancesGrouped =
    baseAssetLiabilityAccountIds.length > 0
      ? await prisma.booking.groupBy({
          by: ["accountId"],
          where: {
            accountBookId: args.accountBookId,
            accountId: { in: baseAssetLiabilityAccountIds },
            date: {
              lt: accountBookStartDate,
            },
          },
          _sum: {
            value: true,
          },
        })
      : [];

  const transferClearingUnitBuckets = await loadTransferClearingUnitBuckets({
    accountBookId: args.accountBookId,
    periodEndExclusive: accountBookStartDate,
    referenceCurrency: args.referenceCurrency,
  });

  const endOfPeriodRawBalanceByAccountId = new Map(
    endOfPeriodRawBalancesGrouped.map((balance) => [
      balance.accountId,
      toMoneyNumber(balance._sum.value ?? 0),
    ]),
  );

  const { virtualGroups, virtualAccounts, rawBalanceByVirtualAccountId } =
    buildTransferClearingVirtualHierarchy({
      unitBuckets: transferClearingUnitBuckets,
    });

  for (const [accountId, rawBalance] of rawBalanceByVirtualAccountId) {
    endOfPeriodRawBalanceByAccountId.set(accountId, rawBalance);
  }

  const exchangeRateByKey = new Map<string, Promise<number | null>>();
  const openingBalanceStats =
    await computeEndOfPeriodBalanceStatsWithConvertedBalances({
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
  const { assetAmountByAccountId, liabilityAmountByAccountId } =
    buildBalanceTimelineScopeAmountMaps({
      accounts: [...baseAssetLiabilityAccounts, ...virtualAccounts],
      convertedBalanceByAccountId:
        openingBalanceStats.convertedBalanceByAccountId,
    });
  const scopedMetricValue = resolveScopedMetricValue({
    metricScopeFilter: args.metricScopeFilter,
    amountByMetric: {
      income: new Map(),
      expenses: new Map(),
      assets: assetAmountByAccountId,
      liabilities: liabilityAmountByAccountId,
    },
    allAccountGroups: [...accountGroups, ...virtualGroups],
  });

  return {
    date: openingBalanceDate.toISOString(),
    label: "Opening Balance",
    assets: round2(openingBalanceStats.assets),
    liabilities: round2(openingBalanceStats.liabilities),
    netWorth: round2(openingBalanceStats.netWorth),
    ...(scopedMetricValue == null
      ? {}
      : { scopedMetricValue: round2(scopedMetricValue) }),
  };
}
