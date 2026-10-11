import { applyPendingHoldingExecutions } from "./holding-executions";
import { toMoney, type Money, moneyAdd, moneySum } from "../../../shared/money";
import {
  isExplicitGainLossBooking,
  isNearZero,
  isWithinPeriod,
  toLotAcquisitionSortKey,
} from "./period-overview-holdings-common";
import { applyMixedPeriodSameUnitHoldingTransfer } from "./period-overview-holdings-mixed-transfer";
import {
  applyHoldingTransferWithoutRealization,
  resolveHoldingTransferDirection,
  toHoldingUnitIdentifier,
} from "./period-overview-holdings-transfer";
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
  for (const transaction of args.transactions) {
    const allNonExplicitBookings = transaction.bookings.filter(
      (booking) => !isExplicitGainLossBooking(booking),
    );

    if (allNonExplicitBookings.length === 0) {
      continue;
    }

    const inPeriodHoldingBookings = allNonExplicitBookings.filter((booking) => {
      if (
        !isWithinPeriod({
          date: booking.date,
          periodStart: args.periodStart,
          periodEndExclusive: args.periodEndExclusive,
        })
      ) {
        return false;
      }
      const state = args.state.stateByHoldingAccountId.get(booking.accountId);
      return state != null && !state.skipped;
    });

    if (inPeriodHoldingBookings.length === 0) {
      continue;
    }

    const allNonExplicitAreHolding = allNonExplicitBookings.every((booking) => {
      const state = args.state.stateByHoldingAccountId.get(booking.accountId);
      return state != null && !state.skipped;
    });
    const allNonExplicitInPeriod = allNonExplicitBookings.every((booking) =>
      isWithinPeriod({
        date: booking.date,
        periodStart: args.periodStart,
        periodEndExclusive: args.periodEndExclusive,
      }),
    );
    const nonExplicitUnitIdentifiers = new Set(
      allNonExplicitBookings.map((booking) =>
        toHoldingUnitIdentifier({
          unit: booking.unit,
          currency: booking.currency,
          cryptocurrency: booking.cryptocurrency,
          symbol: booking.symbol,
          tradeCurrency: booking.tradeCurrency,
        }),
      ),
    );
    if (
      args.state.chronological &&
      allNonExplicitAreHolding &&
      allNonExplicitInPeriod &&
      nonExplicitUnitIdentifiers.size === 1 &&
      !nonExplicitUnitIdentifiers.has(null) &&
      isNearZero(
        moneySum(inPeriodHoldingBookings.map((booking) => booking.value)),
      )
    ) {
      (args.state.holdingTransfers ??= []).push(inPeriodHoldingBookings);
      continue;
    }
    const transferDirection =
      allNonExplicitAreHolding &&
      allNonExplicitInPeriod &&
      nonExplicitUnitIdentifiers.size === 1 &&
      !nonExplicitUnitIdentifiers.has(null)
        ? resolveHoldingTransferDirection({
            stateByHoldingAccountId: args.state.stateByHoldingAccountId,
            holdingBookings: inPeriodHoldingBookings,
          })
        : null;

    if (transferDirection != null) {
      applyHoldingTransferWithoutRealization({
        stateByHoldingAccountId: args.state.stateByHoldingAccountId,
        holdingBookings: inPeriodHoldingBookings,
        direction: transferDirection,
      });
      continue;
    }

    const handledAsMixedTransfer =
      await applyMixedPeriodSameUnitHoldingTransfer({
        state: args.state,
        inPeriodHoldingBookings,
        allNonExplicitAreHolding,
        allNonExplicitInPeriod,
        nonExplicitUnitIdentifiers,
        convertBookingToReference: args.convertBookingToReference,
        onSkippedItem: args.onSkippedItem,
      });
    if (handledAsMixedTransfer) {
      continue;
    }

    await applyHoldingTransactionExecutionPricing({
      state: args.state,
      inPeriodHoldingBookings,
      allNonExplicitBookings,
      allNonExplicitAreHolding,
      nonExplicitUnitIdentifiers,
      convertBookingToReference: args.convertBookingToReference,
      onSkippedItem: args.onSkippedItem,
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
  if (args.state.chronological)
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
    chronological?: boolean;
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

  state.chronological = args.chronological;
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
