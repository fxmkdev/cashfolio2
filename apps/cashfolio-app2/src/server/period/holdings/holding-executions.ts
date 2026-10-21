import {
  applyHoldingTransfer,
  resolveHoldingTransferDirection,
} from "./period-overview-holdings-transfer";
import type {
  HoldingAccountState,
  HoldingExecutionEvent,
} from "./period-overview-holdings-types";
import { toMoney } from "../../../shared/money";
import { applyHoldingAccountExecution } from "./period-holding-account-finalization";
import { prepareMixedPeriodSameUnitHoldingTransfer } from "./period-overview-holdings-mixed-transfer";
import { toHoldingUnitIdentifier } from "./period-overview-holdings-transfer";
import { buildHoldingReplayOperations } from "./holding-replay-operations";
import type {
  HoldingGainLossWorkingState,
  HoldingSkippedItem,
  HoldingTransactionBooking,
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
  const operations = buildHoldingReplayOperations(args.state);
  const carryApplications = new Map<
    HoldingTransactionBooking[],
    Awaited<ReturnType<typeof prepareMixedPeriodSameUnitHoldingTransfer>>
  >();
  for (const operation of operations) {
    if (operation.execution) {
      execute(operation.execution.state, operation.execution.event);
      continue;
    }
    if (operation.carry) {
      if (!carryApplications.has(operation.carry)) {
        carryApplications.set(
          operation.carry,
          await prepareMixedPeriodSameUnitHoldingTransfer({
            state: args.state,
            inPeriodHoldingBookings: operation.carry,
            allNonExplicitAreHolding: true,
            allNonExplicitInPeriod: false,
            nonExplicitUnitIdentifiers: new Set(
              operation.carry.map(toHoldingUnitIdentifier),
            ),
            convertBookingToReference: args.state.convertBookingToReference!,
            onSkippedItem: args.onSkippedItem,
          }),
        );
      }
      carryApplications.get(operation.carry)?.(operation.bookings);
      continue;
    }
    const { bookings, transfer } = operation;
    const direction = transfer.atomic
      ? resolveHoldingTransferDirection({
          stateByHoldingAccountId: args.state.stateByHoldingAccountId,
          holdingBookings: bookings,
        })
      : transfer.direction;
    if (direction) {
      applyHoldingTransfer({
        stateByHoldingAccountId: args.state.stateByHoldingAccountId,
        holdingBookings: bookings,
        direction,
        transferPool: transfer.pool,
        captureLotMatches: args.captureLotMatches,
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
          portion: "transfer-fallback",
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
  args.state.holdingCarries = [];
}
