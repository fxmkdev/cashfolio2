import { AccountType } from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import { startOfUtcDay } from "../shared/date";
import { filterConvertibleHoldingAccounts } from "./period-helpers";

export type PeriodTimelinePointContext = {
  referenceCurrency: string;
  accountBookStartDate: Date;
  holdingAccountsResolved: ReturnType<typeof filterConvertibleHoldingAccounts>;
};

export async function loadPeriodTimelinePointContext(args: {
  accountBookId: string;
}): Promise<PeriodTimelinePointContext> {
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
        in: [AccountType.ASSET, AccountType.LIABILITY],
      },
    },
    select: {
      id: true,
      unit: true,
      currency: true,
      cryptocurrency: true,
      symbol: true,
      tradeCurrency: true,
    },
  });

  return {
    referenceCurrency,
    accountBookStartDate: startOfUtcDay(accountBook.startDate),
    holdingAccountsResolved: filterConvertibleHoldingAccounts(
      baseAssetLiabilityAccounts,
      referenceCurrency,
    ),
  };
}
