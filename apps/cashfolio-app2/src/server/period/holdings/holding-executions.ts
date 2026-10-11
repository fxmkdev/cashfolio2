import {
  applyHoldingTransferWithoutRealization,
  resolveHoldingTransferDirection,
} from "./period-overview-holdings-transfer";
import type {
  HoldingAccountState,
  HoldingExecutionEvent,
  HoldingTransactionBooking,
} from "./period-overview-holdings-types";
import { toMoney } from "../../../shared/money";
import { applyHoldingAccountExecution } from "./period-holding-account-finalization";
import { toLotAcquisitionSortKey } from "./period-overview-holdings-common";
import type {
  HoldingGainLossWorkingState,
  HoldingSkippedItem,
} from "./period-overview-holdings-types";

/** Consume pending executions without valuing open lots, allowing chronological transfers. */
export async function applyPendingHoldingExecutions(args: {
  state: HoldingGainLossWorkingState;
  captureLotMatches?: boolean;
  onSkippedItem?: (item: HoldingSkippedItem) => void;
}) {
  const execute = (
    state: HoldingAccountState,
    event: HoldingExecutionEvent,
  ) => {
    args.state.skippedCount += applyHoldingAccountExecution({
      state,
      event,
      onSkippedItem: args.onSkippedItem,
      onAccountExecutionEvent: args.captureLotMatches
        ? (processed) => {
            (state.processedExecutionEvents ??= []).push(processed);
          }
        : undefined,
    });
  };
  const events = [...args.state.stateByHoldingAccountId.values()].flatMap(
    (state) =>
      state.skipped
        ? []
        : state.executionEvents.map((event) => ({ state, event })),
  );
  const operations = [
    ...events.map((item) => ({
      sortKey: toLotAcquisitionSortKey({
        date: item.event.date,
        bookingId: item.event.bookingId,
      }),
      execution: item,
      transfer: undefined as HoldingTransactionBooking[] | undefined,
    })),
    ...(args.state.holdingTransfers ?? []).map((bookings) => ({
      sortKey: bookings
        .map((booking) =>
          toLotAcquisitionSortKey({
            date: booking.date,
            bookingId: booking.id,
          }),
        )
        .sort()
        .at(-1)!,
      execution: undefined,
      transfer: bookings,
    })),
  ].sort((left, right) => left.sortKey.localeCompare(right.sortKey, "en"));
  for (const operation of operations) {
    if (operation.execution) {
      execute(operation.execution.state, operation.execution.event);
      continue;
    }
    const bookings = operation.transfer!;
    const direction = resolveHoldingTransferDirection({
      stateByHoldingAccountId: args.state.stateByHoldingAccountId,
      holdingBookings: bookings,
    });
    if (direction) {
      applyHoldingTransferWithoutRealization({
        stateByHoldingAccountId: args.state.stateByHoldingAccountId,
        holdingBookings: bookings,
        direction,
      });
    } else {
      // Preserve the existing market fallback for same-unit movements without transferable lots.
      for (const booking of bookings) {
        const amount = await args.state.convertBookingToReference!(booking);
        if (amount == null) {
          args.state.skippedCount += 1;
          args.onSkippedItem?.({
            accountId: booking.accountId,
            bookingId: booking.id,
            transactionId: booking.transactionId,
            reason: "missingConversion",
            date: booking.date,
          });
          continue;
        }
        args.state.convertedCount += 1;
        execute(args.state.stateByHoldingAccountId.get(booking.accountId)!, {
          bookingId: booking.id,
          bookingDescription: booking.description,
          transactionId: booking.transactionId,
          transactionDescription: booking.transactionDescription,
          date: booking.date,
          quantity: booking.value,
          pricingSource: "marketFallback",
          marketReferenceAmount: amount,
          residualAllocationAmount: toMoney(0),
          effectiveReferenceAmount: amount,
        });
      }
    }
  }
  for (const state of args.state.stateByHoldingAccountId.values())
    state.executionEvents = [];
  args.state.holdingTransfers = [];
}
