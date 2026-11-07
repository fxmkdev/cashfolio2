import { Unit } from "../../../.prisma-client/enums";
import {
  moneyAbs,
  moneyAdd,
  moneyDivide,
  moneyMultiply,
  moneySum,
  toMoney,
  type Money,
} from "../../../shared/money";
import { isNearZero } from "../../holdings/quantity-policy";
import {
  decomposeHoldingTransaction,
  isMultiUnitTransaction,
  isWithinPeriod,
} from "../../holdings/transactions";
import type { PeriodBaseExecutionResidualTransaction } from "../base-data/period-base-data-types";

export type ExecutionResidualContribution = {
  originatingAccountIds: string[];
  bookingId: string;
  transactionId: string;
  date: Date;
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

type ExecutionResidualArgs = {
  transactions: PeriodBaseExecutionResidualTransaction[];
  periodStart: Date;
  periodEndExclusive: Date;
  referenceCurrency: string;
  trackedHoldingAccountIdSet: Set<string>;
  assetLiabilityAccountIdSet?: ReadonlySet<string>;
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
};

export async function computeExecutionResidualRealization(
  args: ExecutionResidualArgs,
) {
  const totals: ExecutionResidualTotals = {
    realizedGainLoss: toMoney(0),
    convertedCount: 0,
    skippedCount: 0,
  };
  for (const transaction of args.transactions) {
    const nonExplicitBookings = selectResidualExecutionBookings(
      args,
      transaction,
    );
    if (!nonExplicitBookings) continue;
    const conversion = await convertResidualExecution(
      args,
      nonExplicitBookings,
      totals,
    );
    const { executionResidualInReference, hasMissingConversion } = conversion;
    if (hasMissingConversion || isNearZero(executionResidualInReference))
      continue;
    totals.realizedGainLoss = moneyAdd(
      totals.realizedGainLoss,
      executionResidualInReference,
    );
    attributeExecutionResidual(
      args,
      transaction,
      nonExplicitBookings,
      conversion,
    );
  }
  return totals;
}

type ResidualTransaction = PeriodBaseExecutionResidualTransaction;
type ResidualBooking = ResidualTransaction["bookings"][number];
type ExecutionResidualTotals = {
  realizedGainLoss: Money;
  convertedCount: number;
  skippedCount: number;
};

function selectResidualExecutionBookings(
  args: ExecutionResidualArgs,
  transaction: ResidualTransaction,
): ResidualBooking[] | null {
  const originalById = new Map(
    transaction.bookings.map((booking) => [booking.id, booking]),
  );
  const { residualBookings } = decomposeHoldingTransaction(
    transaction.bookings.map((booking) => ({
      ...booking,
      accountType: args.trackedHoldingAccountIdSet.has(booking.accountId)
        ? "BALANCE"
        : "EQUITY",
      equityAccountSubtype: null,
    })),
    args.trackedHoldingAccountIdSet,
  );
  const nonExplicitBookings = residualBookings.map((booking) => ({
    ...originalById.get(booking.id)!,
    value: booking.value,
  }));

  if (nonExplicitBookings.length === 0) {
    return null;
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
    return null;
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
    return null;
  }

  return nonExplicitBookings;
}

async function convertResidualExecution(
  args: ExecutionResidualArgs,
  nonExplicitBookings: ResidualBooking[],
  totals: ExecutionResidualTotals,
) {
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
      totals.skippedCount += 1;
      hasMissingConversion = true;
      continue;
    }

    totals.convertedCount += 1;
    executionResidualInReference = moneyAdd(
      executionResidualInReference,
      convertedValue,
    );
    convertedByBookingId.set(booking.id, convertedValue);
  }

  return {
    executionResidualInReference,
    convertedByBookingId,
    hasMissingConversion,
  };
}

function attributeExecutionResidual(
  args: ExecutionResidualArgs,
  transaction: ResidualTransaction,
  nonExplicitBookings: ResidualBooking[],
  conversion: Awaited<ReturnType<typeof convertResidualExecution>>,
) {
  const { convertedByBookingId, executionResidualInReference } = conversion;
  const nonReferenceBookings = nonExplicitBookings.filter((booking) =>
    isNonReferenceExecutionBooking({
      unit: booking.unit,
      currency: booking.currency,
      referenceCurrency: args.referenceCurrency,
    }),
  );
  if (nonReferenceBookings.length === 0) {
    return;
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
      originatingAccountIds: [
        ...new Set(
          nonExplicitBookings
            .filter((leg) =>
              args.assetLiabilityAccountIdSet?.has(leg.accountId),
            )
            .map((leg) => leg.accountId),
        ),
      ],
      bookingId: booking.id,
      transactionId: transaction.id,
      date: booking.date,
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
