import { checkResourceBudget } from "../../resource-context.server";
import { applyPendingHoldingExecutions } from "./holding-executions";
import { toMoney, type Money, moneyAdd } from "../../../shared/money";
import {
  isNearZero,
  toLotAcquisitionSortKey,
} from "./period-overview-holdings-common";
import { getHoldingTransactionContext } from "./holding-transaction-context";
import type {
  HoldingAccountState,
  HoldingBookingConverter,
  HoldingGainLossFinalizationCallbacks,
  HoldingInitialSkippedItem,
  HoldingTransactionSkippedItem,
  HoldingGainLossWorkingState,
  HoldingLot,
  HoldingRateConvertibleAccount,
  HoldingRateResolver,
  HoldingTransaction,
} from "./period-overview-holdings-types";

import { applyHoldingTransactionExecutionPricing } from "./period-holding-execution-pricing";
import { finalizeHoldingAccountGainLoss } from "./period-holding-account-finalization";

export type {
  HoldingGainLossWorkingState,
  HoldingGainLossSkippedReason,
} from "./period-overview-holdings-types";

export async function initializeHoldingGainLossState(args: {
  holdingAccounts: HoldingRateConvertibleAccount[];
  initialBalanceByAccountId: Map<string, Money>;
  initialRateDate: Date;
  resolveRate: HoldingRateResolver;
  onSkippedItem?: (item: HoldingInitialSkippedItem) => void;
}): Promise<HoldingGainLossWorkingState> {
  const stateByHoldingAccountId = new Map<string, HoldingAccountState>();
  let skippedCount = 0;

  const initialStates = await Promise.all(
    args.holdingAccounts.map(async (account) => {
      const lots: HoldingLot[] = [];
      let skipped = false;
      let skippedIncrement = 0;
      const initialBalance =
        args.initialBalanceByAccountId.get(account.id) ?? toMoney(0);

      if (!isNearZero(initialBalance)) {
        const initialRate = await args.resolveRate({
          unit: account.unit,
          currency: account.currency,
          cryptocurrency: account.cryptocurrency,
          symbol: account.symbol,
          tradeCurrency: account.tradeCurrency,
          date: args.initialRateDate,
        });

        if (initialRate == null) {
          skippedIncrement = 1;
          skipped = true;
          args.onSkippedItem?.({
            accountId: account.id,
            reason: "missingInitialRate",
            date: args.initialRateDate,
          });
        } else {
          lots.push({
            quantity: initialBalance,
            unitCostInReference: initialRate,
            acquisitionSortKey: toLotAcquisitionSortKey({
              date: args.initialRateDate,
              bookingId: `opening:${account.id}`,
            }),
          });
        }
      }

      return {
        accountId: account.id,
        state: {
          account,
          lots,
          executionEvents: [],
          skipped,
        } satisfies HoldingAccountState,
        skippedIncrement,
      };
    }),
  );

  for (const initialState of initialStates) {
    stateByHoldingAccountId.set(initialState.accountId, initialState.state);
    skippedCount += initialState.skippedIncrement;
  }

  return {
    stateByHoldingAccountId,
    skippedCount,
    convertedCount: 0,
  };
}

export async function applyHoldingTransactionsToGainLossState(args: {
  state: HoldingGainLossWorkingState;
  transactions: HoldingTransaction[];
  periodStart: Date;
  periodEndExclusive: Date;
  convertBookingToReference: HoldingBookingConverter;
  onSkippedItem?: (item: HoldingTransactionSkippedItem) => void;
}) {
  args.state.convertBookingToReference = args.convertBookingToReference;
  for (const transaction of args.transactions) {
    checkResourceBudget();
    const context = getHoldingTransactionContext({ ...args, transaction });
    for (const bookings of context.transfers) {
      const inPeriodHoldingBookings = bookings.filter(
        (booking) =>
          booking.date >= args.periodStart &&
          booking.date < args.periodEndExclusive,
      );
      if (!inPeriodHoldingBookings.length) continue;
      if (inPeriodHoldingBookings.length !== bookings.length) {
        (args.state.holdingCarries ??= []).push(inPeriodHoldingBookings);
      } else {
        (args.state.holdingTransfers ??= []).push(bookings);
      }
    }
    if (!context.inPeriodHoldingBookings.length) continue;
    await applyHoldingTransactionExecutionPricing({
      ...args,
      ...context,
    });
  }
}

export async function finalizeHoldingGainLossState(
  args: {
    state: HoldingGainLossWorkingState;
    periodEnd: Date;
    resolveRate: HoldingRateResolver;
  } & HoldingGainLossFinalizationCallbacks,
) {
  await applyPendingHoldingExecutions({
    state: args.state,
    captureLotMatches: !!args.onAccountExecutionEvent,
    onSkippedItem: args.onSkippedItem,
  });
  let skippedCount = args.state.skippedCount;
  const convertedCount = args.state.convertedCount;
  let realizedGainLoss: Money = toMoney(0);
  let unrealizedGainLoss: Money = toMoney(0);

  for (const state of args.state.stateByHoldingAccountId.values()) {
    if (state.skipped) {
      continue;
    }

    const accountResult = await finalizeHoldingAccountGainLoss({
      state,
      periodEnd: args.periodEnd,
      resolveRate: args.resolveRate,
      onAccountExecutionEvent: args.onAccountExecutionEvent,
      onAccountUnvaluedOpenLot: args.onAccountUnvaluedOpenLot,
      onAccountOpenLotValuation: args.onAccountOpenLotValuation,
      onSkippedItem: args.onSkippedItem,
    });
    const accountRealizedGainLoss = accountResult.realizedGainLoss;
    const accountUnrealizedGainLoss = accountResult.unrealizedGainLoss;
    skippedCount += accountResult.skippedCount;

    realizedGainLoss = moneyAdd(realizedGainLoss, accountRealizedGainLoss);
    unrealizedGainLoss = moneyAdd(
      unrealizedGainLoss,
      accountUnrealizedGainLoss,
    );

    if (
      args.onAccountGainLoss &&
      (!isNearZero(accountRealizedGainLoss) ||
        !isNearZero(accountUnrealizedGainLoss))
    ) {
      args.onAccountGainLoss({
        accountId: state.account.id,
        unit: state.account.unit,
        currency: state.account.currency,
        cryptocurrency: state.account.cryptocurrency,
        symbol: state.account.symbol,
        tradeCurrency: state.account.tradeCurrency,
        realizedGainLoss: accountRealizedGainLoss,
        unrealizedGainLoss: accountUnrealizedGainLoss,
      });
    }
  }

  return {
    realizedGainLoss,
    unrealizedGainLoss,
    convertedCount,
    skippedCount,
  };
}

export async function computeHoldingGainLossSplit(
  args: {
    holdingAccounts: HoldingRateConvertibleAccount[];
    initialBalanceByAccountId: Map<string, Money>;
    transactions: HoldingTransaction[];
    periodStart: Date;
    periodEndExclusive: Date;
    initialRateDate: Date;
    periodEnd: Date;
    resolveRate: HoldingRateResolver;
    convertBookingToReference: HoldingBookingConverter;
  } & HoldingGainLossFinalizationCallbacks,
) {
  const state = await initializeHoldingGainLossState({
    holdingAccounts: args.holdingAccounts,
    initialBalanceByAccountId: args.initialBalanceByAccountId,
    initialRateDate: args.initialRateDate,
    resolveRate: args.resolveRate,
    onSkippedItem: args.onSkippedItem,
  });

  state.convertBookingToReference = args.convertBookingToReference;
  await applyHoldingTransactionsToGainLossState({
    state,
    transactions: args.transactions,
    periodStart: args.periodStart,
    periodEndExclusive: args.periodEndExclusive,
    convertBookingToReference: args.convertBookingToReference,
    onSkippedItem: args.onSkippedItem,
  });

  return finalizeHoldingGainLossState({
    state,
    periodEnd: args.periodEnd,
    resolveRate: args.resolveRate,
    onAccountGainLoss: args.onAccountGainLoss,
    onAccountExecutionEvent: args.onAccountExecutionEvent,
    onAccountUnvaluedOpenLot: args.onAccountUnvaluedOpenLot,
    onAccountOpenLotValuation: args.onAccountOpenLotValuation,
    onSkippedItem: args.onSkippedItem,
  });
}
