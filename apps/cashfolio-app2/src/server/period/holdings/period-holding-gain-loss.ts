import {
  toMoney,
  type Money,
  moneyAdd,
  moneySubtract,
  moneySum,
} from "../../../shared/money";
import { AccountType, Unit } from "../../../.prisma-client/enums";
import {
  accumulateGainLossContribution,
  type GainLossContributionAccumulator,
} from "../breakdown/period-gains-losses-contributions";
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
import type { TransferClearingUnitBucket } from "../transfer-clearing/period-transfer-clearing";

import type { PeriodBaseExecutionResidualTransaction } from "../base-data/period-base-data-types";

export async function computePeriodHoldingGainLoss(args: {
  periodStart: Date;
  periodEndExclusive: Date;
  periodEnd: Date;
  initialHoldingDate: Date;
  referenceCurrency: string;
  transferClearingBatchSize: number;
  holdingAccounts: HoldingRateConvertibleAccount[];
  transferClearingHoldingAccounts: HoldingRateConvertibleAccount[];
  transferClearingUnitBuckets: TransferClearingUnitBucket[];
  assetLiabilityAccountNameById: Map<string, string>;
  gainsLossesContributionByKey: Map<string, GainLossContributionAccumulator>;
  initialHoldingBalances: Array<{
    accountId: string;
    rawBalance: Money;
  }>;
  holdingTransactions: Array<
    HoldingTransaction & {
      id?: string;
    }
  >;
  executionResidualTransactions: PeriodBaseExecutionResidualTransaction[];
  resolveRate: (input: {
    unit: Unit;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
    date: Date;
  }) => Promise<Money | null>;
  convertBookingToReference: (booking: {
    value: Money;
    unit: Unit;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
    date: Date;
  }) => Promise<Money | null>;
}) {
  const holdingAccountIds = args.holdingAccounts.map((account) => account.id);
  const holdingAccountIdSet = new Set(holdingAccountIds);
  const trackedHoldingAccounts = [
    ...args.holdingAccounts,
    ...args.transferClearingHoldingAccounts,
  ];

  let holdingGainLossSplit = {
    realizedGainLoss: toMoney(0),
    unrealizedGainLoss: toMoney(0),
    convertedCount: 0,
    skippedCount: 0,
  };

  if (trackedHoldingAccounts.length > 0) {
    const initialHoldingBalanceByAccountId = new Map<string, Money>();
    for (const balance of args.initialHoldingBalances) {
      initialHoldingBalanceByAccountId.set(
        balance.accountId,
        balance.rawBalance,
      );
    }

    for (const unitBucket of args.transferClearingUnitBuckets) {
      if (!unitBucket.isNonReferenceUnit) {
        continue;
      }

      const openingPostedBalance = unitBucket.bookings
        .filter((booking) => booking.date < args.periodStart)
        .map((booking) => booking.value);
      const openingBalance = moneySubtract(0, moneySum(openingPostedBalance));
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

    await applyHoldingTransactionsToGainLossState({
      state: holdingGainLossState,
      transactions: args.holdingTransactions.map((transaction) => ({
        bookings: transaction.bookings,
      })),
      periodStart: args.periodStart,
      periodEndExclusive: args.periodEndExclusive,
      convertBookingToReference: ({ id: _id, ...booking }) =>
        args.convertBookingToReference(booking),
    });

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
              value: toMoney(booking.value).neg(),
              unit: booking.unit,
              currency: booking.currency,
              cryptocurrency: booking.cryptocurrency,
              symbol: booking.symbol,
              tradeCurrency: booking.tradeCurrency,
              accountType: AccountType.BALANCE,
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
      transactions: args.executionResidualTransactions,
      periodStart: args.periodStart,
      periodEndExclusive: args.periodEndExclusive,
      referenceCurrency: args.referenceCurrency,
      trackedHoldingAccountIdSet: holdingAccountIdSet,
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
          unrealizedGainLoss: toMoney(0),
        });
      },
    });

  return {
    realizedGainLoss: moneyAdd(
      holdingGainLossSplit.realizedGainLoss,
      executionResidualRealization.realizedGainLoss,
    ),
    unrealizedGainLoss: holdingGainLossSplit.unrealizedGainLoss,
    convertedCount:
      holdingGainLossSplit.convertedCount +
      executionResidualRealization.convertedCount,
    skippedCount:
      holdingGainLossSplit.skippedCount +
      executionResidualRealization.skippedCount,
  };
}
