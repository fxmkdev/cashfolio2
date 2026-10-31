import {
  getLegacyHoldingGainLossScope,
  type HistoryScopeOption,
} from "../../../shared/history-scope";
import { AccountType } from "../../../.prisma-client/enums";
import { prisma } from "../../../prisma.server";
import { startOfUtcDay } from "../../../shared/date";
import { filterConvertibleHoldingAccounts } from "../period-helpers";
import { buildNetWorthHistoryScopeOptions } from "./period-history-scopes.server";

export type PeriodHistoryPointContext = {
  revision: string;
  referenceCurrency: string;
  accountBookStartDate: Date;
  holdingAccountsResolved: ReturnType<typeof filterConvertibleHoldingAccounts>;
  hasCashAccounts: boolean;
  gainLossAccountScopes?: HistoryScopeOption[];
  netWorthScopes: HistoryScopeOption[];
};

export async function loadPeriodHistoryPointContext(args: {
  accountBookId: string;
}): Promise<PeriodHistoryPointContext> {
  const accountBook = await prisma.accountBook.findUniqueOrThrow({
    where: { id: args.accountBookId },
    select: {
      periodCacheRevision: true,
      referenceCurrency: true,
      startDate: true,
    },
  });

  const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
  const [baseAssetLiabilityAccounts, balanceGroups] = await Promise.all([
    prisma.account.findMany({
      where: {
        accountBookId: args.accountBookId,
        type: {
          in: [AccountType.BALANCE],
        },
      },
      select: {
        id: true,
        name: true,
        groupId: true,
        unit: true,
        currency: true,
        cryptocurrency: true,
        symbol: true,
        tradeCurrency: true,
        isCashAccount: true,
      },
    }),
    prisma.accountGroup.findMany({
      where: { accountBookId: args.accountBookId, type: AccountType.BALANCE },
      select: { id: true, name: true, parentGroupId: true },
    }),
  ]);

  return {
    revision: accountBook.periodCacheRevision,
    referenceCurrency,
    netWorthScopes: buildNetWorthHistoryScopeOptions({
      accounts: baseAssetLiabilityAccounts,
      groups: balanceGroups,
    }),
    accountBookStartDate: startOfUtcDay(accountBook.startDate),
    gainLossAccountScopes: baseAssetLiabilityAccounts.map((account) => ({
      value: `gain-loss-account:${account.id}`,
      label: account.id,
      kind: "gainLoss",
      legacyValues: [
        `explicit-account:${account.id}`,
        getLegacyHoldingGainLossScope(account),
      ],
    })),
    holdingAccountsResolved: filterConvertibleHoldingAccounts(
      baseAssetLiabilityAccounts,
      referenceCurrency,
    ),
    hasCashAccounts: baseAssetLiabilityAccounts.some(
      (account) => account.isCashAccount,
    ),
  };
}
