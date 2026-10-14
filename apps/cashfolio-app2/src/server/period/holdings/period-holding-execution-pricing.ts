import {
  toMoney,
  type Money,
  moneyAdd,
  moneySubtract,
  moneyMultiply,
} from "../../../shared/money";
import {
  buildResidualAllocationWeights,
  isNearZero,
  QUANTITY_EPSILON,
} from "./period-overview-holdings-common";
import type {
  HoldingBookingConverter,
  HoldingGainLossWorkingState,
  HoldingTransactionBooking,
  HoldingTransactionSkippedItem,
} from "./period-overview-holdings-types";

/** Price one non-transfer transaction and append its holding execution events. */
export async function applyHoldingTransactionExecutionPricing(args: {
  state: HoldingGainLossWorkingState;
  inPeriodHoldingBookings: HoldingTransactionBooking[];
  allNonExplicitBookings: HoldingTransactionBooking[];
  allNonExplicitAreHolding: boolean;
  nonExplicitUnitIdentifiers: Set<string | null>;
  convertBookingToReference: HoldingBookingConverter;
  onSkippedItem?: (item: HoldingTransactionSkippedItem) => void;
}) {
  const inPeriodHoldingBookingIds = new Set(
    args.inPeriodHoldingBookings.map((booking) => booking.id),
  );
  const counterpartBookings = args.allNonExplicitBookings.filter(
    (booking) => !inPeriodHoldingBookingIds.has(booking.id),
  );
  const bookingsToConvert = [
    ...args.inPeriodHoldingBookings,
    ...counterpartBookings,
  ];

  const convertedByBookingId = new Map<string, Money | null>();
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
      args.onSkippedItem?.({
        accountId: booking.accountId,
        bookingId: booking.id,
        bookingDescription: booking.description,
        transactionDescription: booking.transactionDescription,
        transactionId: booking.transactionId ?? null,
        reason: "missingConversion",
        date: booking.date,
      });
    } else {
      args.state.convertedCount += 1;
    }
  }

  if (
    args.inPeriodHoldingBookings.some(
      (booking) => convertedByBookingId.get(booking.id) == null,
    )
  ) {
    return;
  }

  const counterpartHasMissingConversions = counterpartBookings.some(
    (booking) => convertedByBookingId.get(booking.id) == null,
  );
  const hasPositiveHoldingBooking = args.inPeriodHoldingBookings.some(
    (booking) => toMoney(booking.value).comparedTo(QUANTITY_EPSILON) > 0,
  );
  const hasNegativeHoldingBooking = args.inPeriodHoldingBookings.some(
    (booking) => toMoney(booking.value).comparedTo(-QUANTITY_EPSILON) < 0,
  );
  const shouldAllocateAllHoldingResidual =
    counterpartBookings.length === 0 &&
    args.allNonExplicitAreHolding &&
    args.nonExplicitUnitIdentifiers.size > 1 &&
    hasPositiveHoldingBooking &&
    hasNegativeHoldingBooking;
  const shouldUseMarketFallback =
    counterpartHasMissingConversions ||
    (counterpartBookings.length === 0 && !shouldAllocateAllHoldingResidual);

  const holdingMarketValueByBookingId = new Map<string, Money>(
    args.inPeriodHoldingBookings.map((booking) => [
      booking.id,
      convertedByBookingId.get(booking.id) ?? toMoney(0),
    ]),
  );
  const residualAllocationWeights = buildResidualAllocationWeights({
    holdingBookings: args.inPeriodHoldingBookings,
    holdingMarketValueByBookingId,
  });

  const counterpartTotalInReference = shouldUseMarketFallback
    ? toMoney(0)
    : toMoney(
        counterpartBookings.reduce(
          (sum, booking) =>
            moneyAdd(sum, convertedByBookingId.get(booking.id) ?? toMoney(0)),
          toMoney(0),
        ),
      ).neg();
  const holdingMarketTotalInReference = args.inPeriodHoldingBookings.reduce(
    (sum, booking) =>
      moneyAdd(
        sum,
        holdingMarketValueByBookingId.get(booking.id) ?? toMoney(0),
      ),
    toMoney(0),
  );
  const residualInReference = shouldUseMarketFallback
    ? toMoney(0)
    : moneySubtract(counterpartTotalInReference, holdingMarketTotalInReference);

  for (let index = 0; index < args.inPeriodHoldingBookings.length; index += 1) {
    const booking = args.inPeriodHoldingBookings[index]!;
    const marketReferenceAmount =
      holdingMarketValueByBookingId.get(booking.id) ?? toMoney(0);
    const residualAllocationAmount = shouldUseMarketFallback
      ? toMoney(0)
      : moneyMultiply(residualInReference, residualAllocationWeights[index]!);
    const effectiveReferenceAmount = shouldUseMarketFallback
      ? marketReferenceAmount
      : moneyAdd(marketReferenceAmount, residualAllocationAmount);
    const pricingSource = shouldUseMarketFallback
      ? "marketFallback"
      : isNearZero(residualAllocationAmount)
        ? "directConversion"
        : "residualAdjusted";

    const state = args.state.stateByHoldingAccountId.get(booking.accountId);
    if (!state) {
      continue;
    }

    state.executionEvents.push({
      bookingId: booking.id,
      bookingDescription: booking.description,
      transactionDescription: booking.transactionDescription,
      transactionId: booking.transactionId ?? null,
      date: booking.date,
      quantity: booking.value,
      pricingSource,
      marketReferenceAmount,
      residualAllocationAmount,
      effectiveReferenceAmount,
    });
  }
}
