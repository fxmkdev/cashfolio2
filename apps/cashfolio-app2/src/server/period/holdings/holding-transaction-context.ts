import { moneySum } from "../../../shared/money";
import {
  isExplicitGainLossBooking,
  isNearZero,
  isWithinPeriod,
} from "./period-overview-holdings-common";
import { toHoldingUnitIdentifier } from "./period-overview-holdings-transfer";
import type {
  HoldingGainLossWorkingState,
  HoldingTransaction,
} from "./period-overview-holdings-types";

/** Shared classification for execution pricing and optional valuation prefetch. */
export function getHoldingTransactionContext(args: {
  state: HoldingGainLossWorkingState;
  transaction: HoldingTransaction;
  periodStart: Date;
  periodEndExclusive: Date;
}) {
  const allNonExplicitBookings = args.transaction.bookings.filter(
    (booking) => !isExplicitGainLossBooking(booking),
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
  const isSameUnitHoldingTransfer =
    allNonExplicitAreHolding &&
    nonExplicitUnitIdentifiers.size === 1 &&
    !nonExplicitUnitIdentifiers.has(null);
  return {
    allNonExplicitBookings,
    inPeriodHoldingBookings,
    allNonExplicitAreHolding,
    allNonExplicitInPeriod,
    nonExplicitUnitIdentifiers,
    isChronologicalTransfer:
      !!args.state.chronological &&
      isSameUnitHoldingTransfer &&
      allNonExplicitInPeriod &&
      isNearZero(
        moneySum(inPeriodHoldingBookings.map((booking) => booking.value)),
      ),
  };
}
