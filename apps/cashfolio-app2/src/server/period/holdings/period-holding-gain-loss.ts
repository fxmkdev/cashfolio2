import { AccountType, Unit } from "../../../.prisma-client/enums";
import {
  moneyAdd,
  moneySubtract,
  moneySum,
  toMoney,
  type Money,
} from "../../../shared/money";
import {
  applyHoldingTransactionsToGainLossState,
  finalizeHoldingGainLossState,
  initializeHoldingGainLossState,
} from "../../holdings/engine";
import type {
  HoldingAccountGainLoss,
  HoldingGainLossWorkingState,
  HoldingTransactionBooking,
} from "../../holdings/types";
import {
  accumulateGainLossContribution,
  type GainLossContributionAccumulator,
} from "../breakdown/period-gains-losses-contributions";

import { isNearZero } from "../../holdings/quantity-policy";
import type {
  HoldingRateConvertibleAccount,
  HoldingTransaction,
} from "../../holdings/types";
import type { TransferClearingUnitBucket } from "../transfer-clearing/period-transfer-clearing";
import {
  computeExecutionResidualRealization,
  type ExecutionResidualContribution,
} from "./period-execution-residuals";

import type { PeriodBaseExecutionResidualTransaction } from "../base-data/period-base-data-types";

type PeriodHoldingGainLossArgs = {
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
  onExecutionResidual?: (contribution: ExecutionResidualContribution) => void;
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
};

export async function computePeriodHoldingGainLoss(
  args: PeriodHoldingGainLossArgs,
) {
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
    holdingGainLossSplit = await computeTrackedPeriodHoldings(
      args,
      trackedHoldingAccounts,
    );
  }
  const executionResidualRealization =
    await computeExecutionResidualRealization({
      transactions: args.executionResidualTransactions,
      periodStart: args.periodStart,
      periodEndExclusive: args.periodEndExclusive,
      referenceCurrency: args.referenceCurrency,
      trackedHoldingAccountIdSet: holdingAccountIdSet,
      assetLiabilityAccountIdSet: new Set(
        args.assetLiabilityAccountNameById.keys(),
      ),
      convertBookingToReference: args.convertBookingToReference,
      onContribution: createPeriodResidualContribution(args),
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

function buildInitialPeriodHoldingBalances(args: PeriodHoldingGainLossArgs) {
  const initialHoldingBalanceByAccountId = new Map<string, Money>();
  for (const balance of args.initialHoldingBalances) {
    initialHoldingBalanceByAccountId.set(balance.accountId, balance.rawBalance);
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

  return initialHoldingBalanceByAccountId;
}

async function applyTransferClearingTransactions(
  args: PeriodHoldingGainLossArgs,
  holdingGainLossState: HoldingGainLossWorkingState,
) {
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
          toTransferClearingHoldingBooking(
            transferClearingHoldingAccountId,
            booking,
          ),
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
}

function createPeriodHoldingContribution(
  args: PeriodHoldingGainLossArgs,
): (gainLossByAccount: HoldingAccountGainLoss) => void {
  return (gainLossByAccount) => {
    accumulateGainLossContribution({
      byKey: args.gainsLossesContributionByKey,
      sourceKind: "HOLDING",
      accountId: gainLossByAccount.accountId,
      accountName:
        args.assetLiabilityAccountNameById.get(gainLossByAccount.accountId) ??
        "Unknown account",
      unit: gainLossByAccount.unit,
      currency: gainLossByAccount.currency,
      cryptocurrency: gainLossByAccount.cryptocurrency,
      symbol: gainLossByAccount.symbol,
      tradeCurrency: gainLossByAccount.tradeCurrency,
      realizedGainLoss: gainLossByAccount.realizedGainLoss,
      unrealizedGainLoss: gainLossByAccount.unrealizedGainLoss,
    });
  };
}

function createPeriodResidualContribution(
  args: PeriodHoldingGainLossArgs,
): (contribution: ExecutionResidualContribution) => void {
  return (contribution) => {
    args.onExecutionResidual?.(contribution);
    accumulateGainLossContribution({
      byKey: args.gainsLossesContributionByKey,
      sourceKind: "HOLDING",
      accountId: contribution.accountId,
      accountName: contribution.accountName,
      originatingAccountIds: contribution.originatingAccountIds,
      unit: contribution.unit,
      currency: contribution.currency,
      cryptocurrency: contribution.cryptocurrency,
      symbol: contribution.symbol,
      tradeCurrency: contribution.tradeCurrency,
      realizedGainLoss: contribution.realizedGainLoss,
      unrealizedGainLoss: toMoney(0),
    });
  };
}

function toTransferClearingHoldingBooking(
  transferClearingHoldingAccountId: string,
  booking: TransferClearingUnitBucket["bookings"][number],
): HoldingTransactionBooking {
  return {
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
  };
}

async function computeTrackedPeriodHoldings(
  args: PeriodHoldingGainLossArgs,
  trackedHoldingAccounts: HoldingRateConvertibleAccount[],
) {
  const initialHoldingBalanceByAccountId =
    buildInitialPeriodHoldingBalances(args);
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

  await applyTransferClearingTransactions(args, holdingGainLossState);
  return finalizeHoldingGainLossState({
    state: holdingGainLossState,
    periodEnd: args.periodEnd,
    resolveRate: args.resolveRate,
    onAccountGainLoss: createPeriodHoldingContribution(args),
  });
}
