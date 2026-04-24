import {
  applyExecutionToLots,
  buildResidualAllocationWeights,
  isExplicitGainLossBooking,
  isNearZero,
  isWithinPeriod,
  QUANTITY_EPSILON,
} from "./period-overview-holdings-common";
import {
  applyHoldingTransferWithoutRealization,
  resolveHoldingTransferDirection,
  toHoldingUnitIdentifier,
} from "./period-overview-holdings-transfer";
import type {
  HoldingAccountState,
  HoldingBookingConverter,
  HoldingGainLossWorkingState,
  HoldingLot,
  HoldingRateConvertibleAccount,
  HoldingRateResolver,
  HoldingTransaction,
} from "./period-overview-holdings-types";

export type { HoldingGainLossWorkingState };

function toLotAcquisitionSortKey(args: {
  date: Date;
  bookingId: string;
}): string {
  return `${args.date.toISOString()}::${args.bookingId}`;
}

export async function initializeHoldingGainLossState(args: {
  holdingAccounts: HoldingRateConvertibleAccount[];
  initialBalanceByAccountId: Map<string, number>;
  initialRateDate: Date;
  resolveRate: HoldingRateResolver;
}): Promise<HoldingGainLossWorkingState> {
  const stateByHoldingAccountId = new Map<string, HoldingAccountState>();
  let skippedCount = 0;

  const initialStates = await Promise.all(
    args.holdingAccounts.map(async (account) => {
      const lots: HoldingLot[] = [];
      let skipped = false;
      let skippedIncrement = 0;
      const initialBalance =
        args.initialBalanceByAccountId.get(account.id) ?? 0;

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

    const inPeriodHoldingBookingIds = new Set(
      inPeriodHoldingBookings.map((booking) => booking.id),
    );
    const counterpartBookings = allNonExplicitBookings.filter(
      (booking) => !inPeriodHoldingBookingIds.has(booking.id),
    );
    const bookingsToConvert = [
      ...inPeriodHoldingBookings,
      ...counterpartBookings,
    ];

    const convertedByBookingId = new Map<string, number | null>();
    const convertedValues = await Promise.all(
      bookingsToConvert.map((booking) =>
        args.convertBookingToReference({
          id: booking.id,
          value: booking.value,
          unit: booking.unit,
          currency: booking.currency,
          cryptocurrency: booking.cryptocurrency,
          symbol: booking.symbol,
          tradeCurrency: booking.tradeCurrency,
          date: booking.date,
        }),
      ),
    );

    for (let index = 0; index < bookingsToConvert.length; index += 1) {
      const booking = bookingsToConvert[index]!;
      const convertedValue = convertedValues[index];
      convertedByBookingId.set(booking.id, convertedValue);

      if (convertedValue == null) {
        args.state.skippedCount += 1;
      } else {
        args.state.convertedCount += 1;
      }
    }

    if (
      inPeriodHoldingBookings.some(
        (booking) => convertedByBookingId.get(booking.id) == null,
      )
    ) {
      continue;
    }

    const counterpartHasMissingConversions = counterpartBookings.some(
      (booking) => convertedByBookingId.get(booking.id) == null,
    );
    const hasPositiveHoldingBooking = inPeriodHoldingBookings.some(
      (booking) => booking.value > QUANTITY_EPSILON,
    );
    const hasNegativeHoldingBooking = inPeriodHoldingBookings.some(
      (booking) => booking.value < -QUANTITY_EPSILON,
    );
    const shouldAllocateAllHoldingResidual =
      counterpartBookings.length === 0 &&
      allNonExplicitAreHolding &&
      nonExplicitUnitIdentifiers.size > 1 &&
      hasPositiveHoldingBooking &&
      hasNegativeHoldingBooking;
    const shouldUseMarketFallback =
      counterpartHasMissingConversions ||
      (counterpartBookings.length === 0 && !shouldAllocateAllHoldingResidual);

    const holdingMarketValueByBookingId = new Map<string, number>(
      inPeriodHoldingBookings.map((booking) => [
        booking.id,
        convertedByBookingId.get(booking.id) ?? 0,
      ]),
    );
    const residualAllocationWeights = buildResidualAllocationWeights({
      holdingBookings: inPeriodHoldingBookings,
      holdingMarketValueByBookingId,
    });

    const counterpartTotalInReference = shouldUseMarketFallback
      ? 0
      : -counterpartBookings.reduce(
          (sum, booking) => sum + (convertedByBookingId.get(booking.id) ?? 0),
          0,
        );
    const holdingMarketTotalInReference = inPeriodHoldingBookings.reduce(
      (sum, booking) =>
        sum + (holdingMarketValueByBookingId.get(booking.id) ?? 0),
      0,
    );
    const residualInReference = shouldUseMarketFallback
      ? 0
      : counterpartTotalInReference - holdingMarketTotalInReference;

    for (let index = 0; index < inPeriodHoldingBookings.length; index += 1) {
      const booking = inPeriodHoldingBookings[index]!;
      const marketReferenceAmount =
        holdingMarketValueByBookingId.get(booking.id) ?? 0;
      const effectiveReferenceAmount = shouldUseMarketFallback
        ? marketReferenceAmount
        : marketReferenceAmount +
          residualInReference * residualAllocationWeights[index]!;

      const state = args.state.stateByHoldingAccountId.get(booking.accountId);
      if (!state) {
        continue;
      }

      state.executionEvents.push({
        bookingId: booking.id,
        date: booking.date,
        quantity: booking.value,
        effectiveReferenceAmount,
      });
    }
  }
}

export async function finalizeHoldingGainLossState(args: {
  state: HoldingGainLossWorkingState;
  periodEnd: Date;
  resolveRate: HoldingRateResolver;
  onAccountGainLoss?: (gainLossByAccount: {
    accountId: HoldingRateConvertibleAccount["id"];
    unit: HoldingRateConvertibleAccount["unit"];
    currency: HoldingRateConvertibleAccount["currency"];
    cryptocurrency: HoldingRateConvertibleAccount["cryptocurrency"];
    symbol: HoldingRateConvertibleAccount["symbol"];
    tradeCurrency: HoldingRateConvertibleAccount["tradeCurrency"];
    realizedGainLoss: number;
    unrealizedGainLoss: number;
  }) => void;
}) {
  let skippedCount = args.state.skippedCount;
  const convertedCount = args.state.convertedCount;
  let realizedGainLoss = 0;
  let unrealizedGainLoss = 0;

  for (const state of args.state.stateByHoldingAccountId.values()) {
    if (state.skipped) {
      continue;
    }

    let accountRealizedGainLoss = 0;
    let accountUnrealizedGainLoss = 0;

    state.executionEvents.sort((left, right) => {
      const dateDiff = left.date.getTime() - right.date.getTime();
      if (dateDiff !== 0) {
        return dateDiff;
      }
      return left.bookingId.localeCompare(right.bookingId, "en");
    });

    for (const event of state.executionEvents) {
      if (isNearZero(event.quantity)) {
        continue;
      }

      const executionUnitPriceInReference =
        event.effectiveReferenceAmount / event.quantity;
      if (!Number.isFinite(executionUnitPriceInReference)) {
        skippedCount += 1;
        continue;
      }

      accountRealizedGainLoss += applyExecutionToLots({
        lots: state.lots,
        quantity: event.quantity,
        executionUnitPriceInReference,
        acquisitionSortKey: toLotAcquisitionSortKey({
          date: event.date,
          bookingId: event.bookingId,
        }),
      });
    }

    const openQuantity = state.lots.reduce(
      (sum, lot) => sum + Math.abs(lot.quantity),
      0,
    );
    if (openQuantity > QUANTITY_EPSILON) {
      const periodEndRate = await args.resolveRate({
        unit: state.account.unit,
        currency: state.account.currency,
        cryptocurrency: state.account.cryptocurrency,
        symbol: state.account.symbol,
        tradeCurrency: state.account.tradeCurrency,
        date: args.periodEnd,
      });

      if (periodEndRate == null) {
        skippedCount += 1;
      } else {
        accountUnrealizedGainLoss += state.lots.reduce(
          (sum, lot) =>
            sum + lot.quantity * (periodEndRate - lot.unitCostInReference),
          0,
        );
      }
    }

    realizedGainLoss += accountRealizedGainLoss;
    unrealizedGainLoss += accountUnrealizedGainLoss;

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

export async function computeHoldingGainLossSplit(args: {
  holdingAccounts: HoldingRateConvertibleAccount[];
  initialBalanceByAccountId: Map<string, number>;
  transactions: HoldingTransaction[];
  periodStart: Date;
  periodEndExclusive: Date;
  initialRateDate: Date;
  periodEnd: Date;
  resolveRate: HoldingRateResolver;
  convertBookingToReference: HoldingBookingConverter;
}) {
  const state = await initializeHoldingGainLossState({
    holdingAccounts: args.holdingAccounts,
    initialBalanceByAccountId: args.initialBalanceByAccountId,
    initialRateDate: args.initialRateDate,
    resolveRate: args.resolveRate,
  });

  await applyHoldingTransactionsToGainLossState({
    state,
    transactions: args.transactions,
    periodStart: args.periodStart,
    periodEndExclusive: args.periodEndExclusive,
    convertBookingToReference: args.convertBookingToReference,
  });

  return finalizeHoldingGainLossState({
    state,
    periodEnd: args.periodEnd,
    resolveRate: args.resolveRate,
  });
}
