import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { prisma } from "../prisma.server";
import {
  accumulateGainLossContribution,
  type GainLossContributionAccumulator,
} from "./period-gains-losses-contributions";
import {
  applyHoldingTransactionsToGainLossState,
  finalizeHoldingGainLossState,
  initializeHoldingGainLossState,
} from "./period-overview-holdings";
import { isNearZero } from "./period-overview-holdings-common";
import type {
  HoldingRateConvertibleAccount,
  HoldingTransaction,
} from "./period-overview-holdings-types";
import { computeExecutionResidualRealization } from "./period-execution-residuals";
import type { TransferClearingUnitBucket } from "./period-transfer-clearing";

export async function computePeriodHoldingGainLoss(args: {
  accountBookId: string;
  periodStart: Date;
  periodEndExclusive: Date;
  periodEnd: Date;
  initialHoldingDate: Date;
  referenceCurrency: string;
  transactionPageSize: number;
  transferClearingBatchSize: number;
  holdingAccounts: HoldingRateConvertibleAccount[];
  transferClearingHoldingAccounts: HoldingRateConvertibleAccount[];
  transferClearingUnitBuckets: TransferClearingUnitBucket[];
  assetLiabilityAccountNameById: Map<string, string>;
  gainsLossesContributionByKey: Map<string, GainLossContributionAccumulator>;
  resolveRate: (input: {
    unit: Unit;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
    date: Date;
  }) => Promise<number | null>;
  convertBookingToReference: (booking: {
    value: number;
    unit: Unit;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
    date: Date;
  }) => Promise<number | null>;
}) {
  const holdingAccountIds = args.holdingAccounts.map((account) => account.id);
  const holdingAccountIdSet = new Set(holdingAccountIds);
  const trackedHoldingAccounts = [
    ...args.holdingAccounts,
    ...args.transferClearingHoldingAccounts,
  ];

  let holdingGainLossSplit = {
    realizedGainLoss: 0,
    unrealizedGainLoss: 0,
    convertedCount: 0,
    skippedCount: 0,
  };

  if (trackedHoldingAccounts.length > 0) {
    const initialHoldingBalanceByAccountId = new Map<string, number>();
    if (holdingAccountIds.length > 0) {
      const initialHoldingBalances = await prisma.booking.groupBy({
        by: ["accountId"],
        where: {
          accountBookId: args.accountBookId,
          accountId: { in: holdingAccountIds },
          date: { lt: args.periodStart },
        },
        _sum: { value: true },
      });
      for (const balance of initialHoldingBalances) {
        initialHoldingBalanceByAccountId.set(
          balance.accountId,
          Number(balance._sum.value ?? 0),
        );
      }
    }

    for (const unitBucket of args.transferClearingUnitBuckets) {
      if (!unitBucket.isNonReferenceUnit) {
        continue;
      }

      const openingPostedBalance = unitBucket.bookings
        .filter((booking) => booking.date < args.periodStart)
        .reduce((sum, booking) => sum + booking.value, 0);
      const openingBalance = -openingPostedBalance;
      if (isNearZero(openingBalance)) {
        continue;
      }

      initialHoldingBalanceByAccountId.set(
        `virtual:transfer-clearing:account:${unitBucket.unitKey}`,
        openingBalance,
      );
    }

    const holdingGainLossState = await initializeHoldingGainLossState({
      holdingAccounts: trackedHoldingAccounts,
      initialBalanceByAccountId: initialHoldingBalanceByAccountId,
      initialRateDate: args.initialHoldingDate,
      resolveRate: args.resolveRate,
    });

    if (holdingAccountIds.length > 0) {
      let nextTransactionIdCursor: string | undefined;

      while (true) {
        const transactionsPage = await prisma.transaction.findMany({
          where: {
            accountBookId: args.accountBookId,
            AND: [
              {
                bookings: {
                  some: {
                    accountId: {
                      in: holdingAccountIds,
                    },
                    date: {
                      gte: args.periodStart,
                      lt: args.periodEndExclusive,
                    },
                  },
                },
              },
              {
                bookings: {
                  none: {
                    date: {
                      gte: args.periodEndExclusive,
                    },
                  },
                },
              },
              {
                bookings: {
                  none: {
                    account: {
                      type: AccountType.EQUITY,
                      equityAccountSubtype:
                        EquityAccountSubtype.OPENING_BALANCES,
                    },
                  },
                },
              },
            ],
          },
          orderBy: { id: "asc" },
          take: args.transactionPageSize,
          ...(nextTransactionIdCursor
            ? {
                cursor: {
                  id_accountBookId: {
                    id: nextTransactionIdCursor,
                    accountBookId: args.accountBookId,
                  },
                },
                skip: 1,
              }
            : {}),
          select: {
            id: true,
            bookings: {
              select: {
                id: true,
                accountId: true,
                date: true,
                value: true,
                unit: true,
                currency: true,
                cryptocurrency: true,
                symbol: true,
                tradeCurrency: true,
                account: {
                  select: {
                    type: true,
                    equityAccountSubtype: true,
                  },
                },
              },
              orderBy: [{ date: "asc" }, { id: "asc" }],
            },
          },
        });

        if (transactionsPage.length === 0) {
          break;
        }

        nextTransactionIdCursor =
          transactionsPage[transactionsPage.length - 1].id;

        await applyHoldingTransactionsToGainLossState({
          state: holdingGainLossState,
          transactions: transactionsPage.map((transaction) => ({
            bookings: transaction.bookings.map((booking) => ({
              id: booking.id,
              accountId: booking.accountId,
              date: booking.date,
              value: Number(booking.value),
              unit: booking.unit,
              currency: booking.currency,
              cryptocurrency: booking.cryptocurrency,
              symbol: booking.symbol,
              tradeCurrency: booking.tradeCurrency,
              accountType: booking.account.type,
              equityAccountSubtype: booking.account.equityAccountSubtype,
            })),
          })),
          periodStart: args.periodStart,
          periodEndExclusive: args.periodEndExclusive,
          convertBookingToReference: ({ id: _id, ...booking }) =>
            args.convertBookingToReference(booking),
        });

        if (transactionsPage.length < args.transactionPageSize) {
          break;
        }
      }
    }

    const transferClearingTransactionBatch: HoldingTransaction[] = [];
    const flushTransferClearingTransactionBatch = async () => {
      if (transferClearingTransactionBatch.length === 0) {
        return;
      }

      await applyHoldingTransactionsToGainLossState({
        state: holdingGainLossState,
        transactions: transferClearingTransactionBatch,
        periodStart: args.periodStart,
        periodEndExclusive: args.periodEndExclusive,
        convertBookingToReference: ({ id: _id, ...booking }) =>
          args.convertBookingToReference(booking),
      });
      transferClearingTransactionBatch.length = 0;
    };

    for (const unitBucket of args.transferClearingUnitBuckets) {
      if (!unitBucket.isNonReferenceUnit) {
        continue;
      }

      const transferClearingHoldingAccountId = `virtual:transfer-clearing:account:${unitBucket.unitKey}`;
      for (const booking of unitBucket.bookings) {
        if (
          booking.date < args.periodStart ||
          booking.date >= args.periodEndExclusive ||
          isNearZero(booking.value)
        ) {
          continue;
        }

        transferClearingTransactionBatch.push({
          bookings: [
            {
              id: booking.id,
              accountId: transferClearingHoldingAccountId,
              date: booking.date,
              value: -booking.value,
              unit: booking.unit,
              currency: booking.currency,
              cryptocurrency: booking.cryptocurrency,
              symbol: booking.symbol,
              tradeCurrency: booking.tradeCurrency,
              accountType: AccountType.ASSET,
              equityAccountSubtype: null,
            },
          ],
        });

        if (
          transferClearingTransactionBatch.length >=
          args.transferClearingBatchSize
        ) {
          await flushTransferClearingTransactionBatch();
        }
      }
    }

    await flushTransferClearingTransactionBatch();

    holdingGainLossSplit = await finalizeHoldingGainLossState({
      state: holdingGainLossState,
      periodEnd: args.periodEnd,
      resolveRate: args.resolveRate,
      onAccountGainLoss: (gainLossByAccount) => {
        accumulateGainLossContribution({
          byKey: args.gainsLossesContributionByKey,
          sourceKind: "HOLDING",
          accountId: gainLossByAccount.accountId,
          accountName:
            args.assetLiabilityAccountNameById.get(
              gainLossByAccount.accountId,
            ) ?? "Unknown account",
          unit: gainLossByAccount.unit,
          currency: gainLossByAccount.currency,
          cryptocurrency: gainLossByAccount.cryptocurrency,
          symbol: gainLossByAccount.symbol,
          tradeCurrency: gainLossByAccount.tradeCurrency,
          realizedGainLoss: gainLossByAccount.realizedGainLoss,
          unrealizedGainLoss: gainLossByAccount.unrealizedGainLoss,
        });
      },
    });
  }

  const executionResidualRealization =
    await computeExecutionResidualRealization({
      accountBookId: args.accountBookId,
      periodStart: args.periodStart,
      periodEndExclusive: args.periodEndExclusive,
      referenceCurrency: args.referenceCurrency,
      trackedHoldingAccountIdSet: holdingAccountIdSet,
      pageSize: args.transactionPageSize,
      convertBookingToReference: args.convertBookingToReference,
      onContribution: (contribution) => {
        accumulateGainLossContribution({
          byKey: args.gainsLossesContributionByKey,
          sourceKind: "HOLDING",
          accountId: contribution.accountId,
          accountName: contribution.accountName,
          unit: contribution.unit,
          currency: contribution.currency,
          cryptocurrency: contribution.cryptocurrency,
          symbol: contribution.symbol,
          tradeCurrency: contribution.tradeCurrency,
          realizedGainLoss: contribution.realizedGainLoss,
          unrealizedGainLoss: 0,
        });
      },
    });

  return {
    realizedGainLoss:
      holdingGainLossSplit.realizedGainLoss +
      executionResidualRealization.realizedGainLoss,
    unrealizedGainLoss: holdingGainLossSplit.unrealizedGainLoss,
    convertedCount:
      holdingGainLossSplit.convertedCount +
      executionResidualRealization.convertedCount,
    skippedCount:
      holdingGainLossSplit.skippedCount +
      executionResidualRealization.skippedCount,
  };
}
