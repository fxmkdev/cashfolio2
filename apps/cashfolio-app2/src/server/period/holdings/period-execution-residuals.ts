import {
  toMoney,
  type Money,
  moneyAdd,
  moneyMultiply,
  moneyDivide,
  moneyAbs,
  moneySum,
} from "../../../shared/money";
import { Unit } from "../../../.prisma-client/enums";
import type { PeriodBaseExecutionResidualTransaction } from "../base-data/period-base-data-types";
import { isMultiUnitTransaction } from "../period-helpers";
import { isNearZero, isWithinPeriod } from "./period-overview-holdings-common";

type ExecutionResidualContribution = {
  accountId: string;
  accountName: string;
  unit: Unit;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  realizedGainLoss: Money;
};

function isNonReferenceExecutionBooking(args: {
  unit: Unit;
  currency: string | null;
  referenceCurrency: string;
}) {
  if (args.unit === Unit.CURRENCY) {
    return (
      args.currency != null &&
      args.currency.toUpperCase() !== args.referenceCurrency
    );
  }

  return true;
}

export async function computeExecutionResidualRealization(args: {
  transactions: PeriodBaseExecutionResidualTransaction[];
  periodStart: Date;
  periodEndExclusive: Date;
  referenceCurrency: string;
  trackedHoldingAccountIdSet: Set<string>;
  convertBookingToReference: (booking: {
    value: Money;
    unit: Unit;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
    date: Date;
  }) => Promise<Money | null>;
  onContribution: (contribution: ExecutionResidualContribution) => void;
}) {
  let realizedGainLoss: Money = toMoney(0);
  let convertedCount = 0;
  let skippedCount = 0;
  for (const transaction of args.transactions) {
    const nonExplicitBookings = transaction.bookings;

    if (nonExplicitBookings.length === 0) {
      continue;
    }

    if (
      !isMultiUnitTransaction(
        nonExplicitBookings.map((booking) => ({
          unit: booking.unit,
          currency: booking.currency,
          cryptocurrency: booking.cryptocurrency,
          symbol: booking.symbol,
          tradeCurrency: booking.tradeCurrency,
        })),
      )
    ) {
      continue;
    }

    const hasInPeriodHoldingBooking = nonExplicitBookings.some(
      (booking) =>
        isWithinPeriod({
          date: booking.date,
          periodStart: args.periodStart,
          periodEndExclusive: args.periodEndExclusive,
        }) && args.trackedHoldingAccountIdSet.has(booking.accountId),
    );
    if (hasInPeriodHoldingBooking) {
      continue;
    }

    const convertedValues = await Promise.all(
      nonExplicitBookings.map((booking) =>
        args.convertBookingToReference({
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

    let executionResidualInReference: Money = toMoney(0);
    const convertedByBookingId = new Map<string, Money>();
    let hasMissingConversion = false;

    for (let index = 0; index < nonExplicitBookings.length; index += 1) {
      const booking = nonExplicitBookings[index]!;
      const convertedValue = convertedValues[index];

      if (convertedValue == null) {
        skippedCount += 1;
        hasMissingConversion = true;
        continue;
      }

      convertedCount += 1;
      executionResidualInReference = moneyAdd(
        executionResidualInReference,
        convertedValue,
      );
      convertedByBookingId.set(booking.id, convertedValue);
    }

    if (hasMissingConversion || isNearZero(executionResidualInReference)) {
      continue;
    }

    realizedGainLoss = moneyAdd(realizedGainLoss, executionResidualInReference);

    const nonReferenceBookings = nonExplicitBookings.filter((booking) =>
      isNonReferenceExecutionBooking({
        unit: booking.unit,
        currency: booking.currency,
        referenceCurrency: args.referenceCurrency,
      }),
    );
    if (nonReferenceBookings.length === 0) {
      continue;
    }

    const attributionWeights = nonReferenceBookings.map((booking) =>
      moneyAbs(convertedByBookingId.get(booking.id) ?? toMoney(0)),
    );
    const totalAttributionWeight = moneySum(attributionWeights);

    for (
      let attributionIndex = 0;
      attributionIndex < nonReferenceBookings.length;
      attributionIndex += 1
    ) {
      const booking = nonReferenceBookings[attributionIndex]!;
      const weight =
        toMoney(totalAttributionWeight).comparedTo(0) > 0
          ? moneyDivide(
              attributionWeights[attributionIndex]!,
              totalAttributionWeight,
            )
          : moneyDivide(1, nonReferenceBookings.length);

      args.onContribution({
        accountId: booking.accountId,
        accountName: booking.account.name,
        unit: booking.unit,
        currency: booking.currency,
        cryptocurrency: booking.cryptocurrency,
        symbol: booking.symbol,
        tradeCurrency: booking.tradeCurrency,
        realizedGainLoss: moneyMultiply(executionResidualInReference, weight),
      });
    }
  }

  return {
    realizedGainLoss,
    convertedCount,
    skippedCount,
  };
}
