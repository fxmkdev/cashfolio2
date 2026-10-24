import { Unit } from "../../../.prisma-client/enums";
import type { HistoryScopeOption } from "../../../shared/history-scope";
import { AccountType } from "../../../.prisma-client/enums";
import { prisma } from "../../../prisma.server";
import { startOfUtcDay } from "../../../shared/date";
import { filterConvertibleHoldingAccounts } from "../period-helpers";

export type PeriodHistoryPointContext = {
  referenceCurrency: string;
  accountBookStartDate: Date;
  holdingAccountsResolved: ReturnType<typeof filterConvertibleHoldingAccounts>;
  hasCashAccounts: boolean;
  gainLossAccountScopes?: HistoryScopeOption[];
};

export async function loadPeriodHistoryPointContext(args: {
  accountBookId: string;
}): Promise<PeriodHistoryPointContext> {
  const accountBook = await prisma.accountBook.findUniqueOrThrow({
    where: { id: args.accountBookId },
    select: {
      referenceCurrency: true,
      startDate: true,
    },
  });

  const referenceCurrency = accountBook.referenceCurrency.toUpperCase();
  const baseAssetLiabilityAccounts = await prisma.account.findMany({
    where: {
      accountBookId: args.accountBookId,
      type: {
        in: [AccountType.BALANCE],
      },
    },
    select: {
      id: true,
      unit: true,
      currency: true,
      cryptocurrency: true,
      symbol: true,
      tradeCurrency: true,
      isCashAccount: true,
    },
  });

  return {
    referenceCurrency,
    accountBookStartDate: startOfUtcDay(accountBook.startDate),
    gainLossAccountScopes: baseAssetLiabilityAccounts.map((account) => ({
      value: `gain-loss-account:${account.id}`,
      label: account.id,
      kind: "gainLoss",
      legacyValues: [
        `explicit-account:${account.id}`,
        `unit-account:${account.unit === Unit.CURRENCY ? `fx:${account.currency?.toUpperCase()}` : account.unit === Unit.CRYPTOCURRENCY ? `crypto:${account.cryptocurrency?.toUpperCase()}` : `security:${account.symbol?.toUpperCase()}:${account.tradeCurrency?.toUpperCase()}`}:${account.id}`,
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
