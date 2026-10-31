import {
  classificationOptions,
  type ClassificationNode,
} from "../../../shared/asset-class";
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
  assetClassScopes?: HistoryScopeOption[];

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
      classificationSchemes: {
        where: { id: "assetClass" },
        select: {
          nodes: {
            select: { id: true, name: true, parentId: true, sortOrder: true },
          },
        },
      },
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

  const classes: ClassificationNode[] =
    accountBook.classificationSchemes.flatMap((s) => s.nodes);
  return {
    revision: accountBook.periodCacheRevision,
    assetClassScopes: [
      ...classificationOptions(classes).map((option) => {
        const node = classes.find((n) => n.id === option.value)!;
        return {
          value: `asset-class:${node.id}` as const,
          label: option.label,
          treeLabel: node.name,
          kind: "gainLoss" as const,
          sortOrder: node.sortOrder,
          ...(node.parentId
            ? { parentValue: `asset-class:${node.parentId}` as const }
            : {}),
        };
      }),
      {
        value: "asset-class:unclassified",
        label: "Unclassified",
        treeLabel: "Unclassified",
        kind: "gainLoss",
        sortOrder: Number.MAX_SAFE_INTEGER,
      },
    ],

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
