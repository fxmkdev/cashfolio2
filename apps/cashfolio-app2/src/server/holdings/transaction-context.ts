import { isWithinPeriod } from "./common";
import { decomposeHoldingTransaction } from "./transaction-decomposition";
import type { HoldingGainLossWorkingState, HoldingTransaction } from "./types";
import { toHoldingUnitIdentifier } from "./unit-identity";

/** Shared classification for execution pricing and optional valuation prefetch. */
export function getHoldingTransactionContext(args: {
  state: HoldingGainLossWorkingState;
  transaction: HoldingTransaction;
  periodStart: Date;
  periodEndExclusive: Date;
}) {
  const { transfers, residualBookings: allNonExplicitBookings } =
    decomposeHoldingTransaction(
      args.transaction.bookings,
      new Set(args.state.stateByHoldingAccountId.keys()),
    );
  const inPeriod = (date: Date) =>
    isWithinPeriod({
      date,
      periodStart: args.periodStart,
      periodEndExclusive: args.periodEndExclusive,
    });
  const isHolding = (accountId: string) => {
    const state = args.state.stateByHoldingAccountId.get(accountId);
    return state != null && !state.skipped;
  };
  const inPeriodHoldingBookings = allNonExplicitBookings.filter(
    (booking) => inPeriod(booking.date) && isHolding(booking.accountId),
  );
  const allNonExplicitAreHolding = allNonExplicitBookings.every((booking) =>
    isHolding(booking.accountId),
  );
  const allNonExplicitInPeriod = allNonExplicitBookings.every((booking) =>
    inPeriod(booking.date),
  );
  const nonExplicitUnitIdentifiers = new Set(
    allNonExplicitBookings.map(toHoldingUnitIdentifier),
  );
  return {
    allNonExplicitBookings,
    inPeriodHoldingBookings,
    allNonExplicitAreHolding,
    allNonExplicitInPeriod,
    nonExplicitUnitIdentifiers,
    transfers,
  };
}
