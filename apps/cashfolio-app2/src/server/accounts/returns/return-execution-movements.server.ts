import { MoneyDecimal, type Money } from "../../../shared/money";
import type {
  HoldingGainLossWorkingState,
  HoldingTransactionBooking,
} from "../../holdings/types";
import {
  applyHoldingTransactionExecutionPricing,
  toHoldingUnitIdentifier,
} from "../../holdings/transactions";
import type {
  ReturnTransactionContext,
  ReturnMovement,
} from "./return-transaction-types";
const day = (date: Date) => date.toISOString().slice(0, 10);

export async function prepareResidualMovements(
  context: ReturnTransactionContext,
  residualBookings: HoldingTransactionBooking[],
) {
  const { accountIds, fail } = context;
  const residualBalances = residualBookings.filter((booking) =>
    accountIds.has(booking.accountId),
  );
  if (!residualBalances.length) return;
  if (
    residualBookings.some((booking) => day(booking.date) > context.asOfDate)
  ) {
    fail(
      residualBalances.map((booking) => booking.accountId),
      "A transaction is partially posted at the as-of date.",
    );
    return;
  }
  const movements = await priceResidualMovements(
    context,
    residualBookings,
    residualBalances,
  );
  matchInternalMovements(context, movements);
}
function createExecutionState(
  holdings: HoldingTransactionBooking[],
): HoldingGainLossWorkingState {
  return {
    stateByHoldingAccountId: new Map(
      holdings.map((booking) => [
        booking.accountId,
        {
          account: { ...booking, id: booking.accountId },
          lots: [],
          executionEvents: [],
          skipped: false,
        },
      ]),
    ),
    skippedCount: 0,
    convertedCount: 0,
  };
}
async function priceResidualMovements(
  context: ReturnTransactionContext,
  residualBookings: HoldingTransactionBooking[],
  residualBalances: HoldingTransactionBooking[],
) {
  const { fail, convertCapital: convert, movement } = context;
  const holdings = residualBalances.filter(
    (booking) =>
      !(
        booking.unit === "CURRENCY" &&
        booking.currency?.toUpperCase() === context.referenceCurrency
      ),
  );
  const state = createExecutionState(holdings);
  if (holdings.length)
    await applyHoldingTransactionExecutionPricing({
      state,
      inPeriodHoldingBookings: holdings,
      allNonExplicitBookings: residualBookings,
      allNonExplicitAreHolding: holdings.length === residualBookings.length,
      nonExplicitUnitIdentifiers: new Set(
        residualBookings.map(toHoldingUnitIdentifier),
      ),
      convertBookingToReference: context.convert,
      onSkippedItem: () =>
        fail(
          residualBalances.map((booking) => booking.accountId),
          "Execution pricing is incomplete.",
        ),
    });
  const executions = new Map(
    [...state.stateByHoldingAccountId.values()]
      .flatMap((item) => item.executionEvents)
      .map((event) => [event.bookingId, event]),
  );
  const movements: ReturnMovement[] = [];
  for (const booking of residualBalances) {
    const amount = holdings.includes(booking)
      ? executions.get(booking.id)?.effectiveReferenceAmount
      : await convert(booking);
    if (amount != null) movements.push(movement(booking, amount));
  }
  return movements;
}
function matchInternalMovements(
  context: ReturnTransactionContext,
  movements: ReturnMovement[],
) {
  const { result } = context;
  // Match internal trade consideration, retaining unpaired income/fees as neutral capital.
  const remaining = movements.map((item) => ({ ...item }));
  for (const outgoing of remaining.filter((item) => item.amount.isNegative())) {
    for (const incoming of remaining.filter(
      (item) =>
        item.amount.isPositive() && item.accountId !== outgoing.accountId,
    )) {
      if (!outgoing.amount.isNegative()) break;
      const amount = MoneyDecimal.min(outgoing.amount.neg(), incoming.amount);
      if (amount.isZero()) continue;
      pairInternalMovements(context, outgoing, incoming, amount);
      outgoing.amount = outgoing.amount.plus(amount);
      incoming.amount = incoming.amount.minus(amount);
    }
  }
  result.movements.push(...remaining.filter((item) => !item.amount.isZero()));
}
function pairInternalMovements(
  context: ReturnTransactionContext,
  outgoing: ReturnMovement,
  incoming: ReturnMovement,
  amount: Money,
) {
  const { result } = context;
  result.movements.push(
    {
      ...outgoing,
      id: `${outgoing.id}:${incoming.id}`,
      amount: amount.neg(),
      peerId: incoming.accountId,
    },
    {
      ...incoming,
      id: `${incoming.id}:${outgoing.id}`,
      amount,
      peerId: outgoing.accountId,
    },
  );
  result.bridges.push({
    unit: "CURRENCY",
    currency: context.referenceCurrency,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    fromId: outgoing.accountId,
    toId: incoming.accountId,
    fromDate: outgoing.date,
    toDate: incoming.date,
    quantity: amount,
  });
}
