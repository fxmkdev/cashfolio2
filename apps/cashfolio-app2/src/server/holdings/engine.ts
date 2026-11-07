import { moneyAdd, toMoney, type Money } from "../../shared/money";
import { checkResourceBudget } from "../resource-context.server";
import { finalizeHoldingAccountGainLoss } from "./account-finalization";
import { toLotAcquisitionSortKey } from "./common";
import { applyHoldingTransactionExecutionPricing } from "./execution-pricing";
import { applyPendingHoldingExecutions } from "./executions";
import { isNearZero } from "./quantity-policy";
import { getHoldingTransactionContext } from "./transaction-context";
import type {
  ApplyHoldingTransactionsArgs,
  ComputeHoldingGainLossArgs,
  FinalizeHoldingGainLossArgs,
  HoldingAccountState,
  HoldingGainLossResult,
  HoldingGainLossWorkingState,
  HoldingLot,
  InitializeHoldingGainLossArgs,
} from "./types";

/** Seed opening lots using the caller's rate resolver, retaining account order. */
export async function initializeHoldingGainLossState(
  args: InitializeHoldingGainLossArgs,
): Promise<HoldingGainLossWorkingState> {
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

/** Price transactions and queue replay work without requesting closing rates. */
export async function applyHoldingTransactionsToGainLossState(
  args: ApplyHoldingTransactionsArgs,
) {
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

/** Replay pending work, emit explain callbacks, and value the remaining open lots. */
export async function finalizeHoldingGainLossState(
  args: FinalizeHoldingGainLossArgs,
): Promise<HoldingGainLossResult> {
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
  args: ComputeHoldingGainLossArgs,
): Promise<HoldingGainLossResult> {
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

export { hasOpenHoldingLots } from "./account-finalization";
export { applyPendingHoldingExecutions } from "./executions";
