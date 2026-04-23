import {
  AccountType,
  EquityAccountSubtype,
  type Unit,
} from "../.prisma-client/enums";

const QUANTITY_EPSILON = 1e-9;

type HoldingRateConvertibleAccount = {
  id: string;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

type HoldingTransactionBooking = {
  id: string;
  accountId: string;
  date: Date;
  value: number;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  accountType: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
};

type HoldingTransaction = {
  bookings: HoldingTransactionBooking[];
};

type HoldingLot = {
  quantity: number;
  unitCostInReference: number;
};

type HoldingExecutionEvent = {
  bookingId: string;
  date: Date;
  quantity: number;
  effectiveReferenceAmount: number;
};

type HoldingAccountState = {
  account: HoldingRateConvertibleAccount;
  lots: HoldingLot[];
  executionEvents: HoldingExecutionEvent[];
  skipped: boolean;
};

function isExplicitGainLossBooking(
  booking: HoldingTransactionBooking,
): boolean {
  return (
    booking.accountType === AccountType.EQUITY &&
    booking.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS
  );
}

function isNearZero(value: number): boolean {
  return Math.abs(value) <= QUANTITY_EPSILON;
}

function buildResidualAllocationWeights(args: {
  holdingBookings: HoldingTransactionBooking[];
  holdingMarketValueByBookingId: Map<string, number>;
}): number[] {
  const valueWeights = args.holdingBookings.map((booking) =>
    Math.abs(args.holdingMarketValueByBookingId.get(booking.id) ?? 0),
  );
  const totalValueWeight = valueWeights.reduce(
    (sum, weight) => sum + weight,
    0,
  );

  if (totalValueWeight > QUANTITY_EPSILON) {
    return valueWeights.map((weight) => weight / totalValueWeight);
  }

  const quantityWeights = args.holdingBookings.map((booking) =>
    Math.abs(booking.value),
  );
  const totalQuantityWeight = quantityWeights.reduce(
    (sum, weight) => sum + weight,
    0,
  );

  if (totalQuantityWeight > QUANTITY_EPSILON) {
    return quantityWeights.map((weight) => weight / totalQuantityWeight);
  }

  return args.holdingBookings.map(() => 1 / args.holdingBookings.length);
}

function applyExecutionToLots(args: {
  lots: HoldingLot[];
  quantity: number;
  executionUnitPriceInReference: number;
}): number {
  let realizedGainLoss = 0;
  let remainingQuantity = args.quantity;

  while (
    !isNearZero(remainingQuantity) &&
    args.lots.length > 0 &&
    Math.sign(remainingQuantity) !== Math.sign(args.lots[0]!.quantity)
  ) {
    const lot = args.lots[0]!;
    const closeQuantity = Math.min(
      Math.abs(remainingQuantity),
      Math.abs(lot.quantity),
    );

    if (lot.quantity > 0 && remainingQuantity < 0) {
      realizedGainLoss +=
        closeQuantity *
        (args.executionUnitPriceInReference - lot.unitCostInReference);
    } else if (lot.quantity < 0 && remainingQuantity > 0) {
      realizedGainLoss +=
        closeQuantity *
        (lot.unitCostInReference - args.executionUnitPriceInReference);
    }

    lot.quantity -= Math.sign(lot.quantity) * closeQuantity;
    remainingQuantity -= Math.sign(remainingQuantity) * closeQuantity;

    if (isNearZero(lot.quantity)) {
      args.lots.shift();
    }
  }

  if (!isNearZero(remainingQuantity)) {
    args.lots.push({
      quantity: remainingQuantity,
      unitCostInReference: args.executionUnitPriceInReference,
    });
  }

  return realizedGainLoss;
}

type HoldingRateResolver = (input: {
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
}) => Promise<number | null>;

type HoldingBookingConverter = (booking: {
  id: string;
  value: number;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  date: Date;
}) => Promise<number | null>;

export type HoldingGainLossWorkingState = {
  stateByHoldingAccountId: Map<string, HoldingAccountState>;
  skippedCount: number;
  convertedCount: number;
};

export async function initializeHoldingGainLossState(args: {
  holdingAccounts: HoldingRateConvertibleAccount[];
  initialBalanceByAccountId: Map<string, number>;
  initialRateDate: Date;
  resolveRate: HoldingRateResolver;
}): Promise<HoldingGainLossWorkingState> {
  const stateByHoldingAccountId = new Map<string, HoldingAccountState>();
  let skippedCount = 0;

  for (const account of args.holdingAccounts) {
    const lots: HoldingLot[] = [];
    let skipped = false;
    const initialBalance = args.initialBalanceByAccountId.get(account.id) ?? 0;

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
        skippedCount += 1;
        skipped = true;
      } else {
        lots.push({
          quantity: initialBalance,
          unitCostInReference: initialRate,
        });
      }
    }

    stateByHoldingAccountId.set(account.id, {
      account,
      lots,
      executionEvents: [],
      skipped,
    });
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
    const inPeriodBookings = transaction.bookings.filter(
      (booking) =>
        booking.date >= args.periodStart &&
        booking.date < args.periodEndExclusive,
    );

    if (inPeriodBookings.length === 0) {
      continue;
    }

    const holdingBookings = inPeriodBookings.filter((booking) => {
      const state = args.state.stateByHoldingAccountId.get(booking.accountId);
      return state != null && !state.skipped;
    });

    if (holdingBookings.length === 0) {
      continue;
    }

    const holdingBookingIds = new Set(
      holdingBookings.map((booking) => booking.id),
    );
    const counterpartBookings = inPeriodBookings.filter(
      (booking) =>
        !holdingBookingIds.has(booking.id) &&
        !isExplicitGainLossBooking(booking),
    );
    const bookingsToConvert = [...holdingBookings, ...counterpartBookings];

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
      holdingBookings.some(
        (booking) => convertedByBookingId.get(booking.id) == null,
      )
    ) {
      continue;
    }

    const counterpartHasMissingConversions = counterpartBookings.some(
      (booking) => convertedByBookingId.get(booking.id) == null,
    );
    const shouldUseMarketFallback =
      counterpartBookings.length === 0 || counterpartHasMissingConversions;

    const holdingMarketValueByBookingId = new Map<string, number>(
      holdingBookings.map((booking) => [
        booking.id,
        convertedByBookingId.get(booking.id) ?? 0,
      ]),
    );
    const residualAllocationWeights = buildResidualAllocationWeights({
      holdingBookings,
      holdingMarketValueByBookingId,
    });

    const counterpartTotalInReference = shouldUseMarketFallback
      ? 0
      : -counterpartBookings.reduce(
          (sum, booking) => sum + (convertedByBookingId.get(booking.id) ?? 0),
          0,
        );
    const holdingMarketTotalInReference = holdingBookings.reduce(
      (sum, booking) =>
        sum + (holdingMarketValueByBookingId.get(booking.id) ?? 0),
      0,
    );
    const residualInReference = shouldUseMarketFallback
      ? 0
      : counterpartTotalInReference - holdingMarketTotalInReference;

    for (let index = 0; index < holdingBookings.length; index += 1) {
      const booking = holdingBookings[index]!;
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
}) {
  let skippedCount = args.state.skippedCount;
  const convertedCount = args.state.convertedCount;
  let realizedGainLoss = 0;
  let unrealizedGainLoss = 0;

  for (const state of args.state.stateByHoldingAccountId.values()) {
    if (state.skipped) {
      continue;
    }

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

      realizedGainLoss += applyExecutionToLots({
        lots: state.lots,
        quantity: event.quantity,
        executionUnitPriceInReference,
      });
    }

    const openQuantity = state.lots.reduce(
      (sum, lot) => sum + Math.abs(lot.quantity),
      0,
    );
    if (openQuantity <= QUANTITY_EPSILON) {
      continue;
    }

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
      continue;
    }

    unrealizedGainLoss += state.lots.reduce(
      (sum, lot) =>
        sum + lot.quantity * (periodEndRate - lot.unitCostInReference),
      0,
    );
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
