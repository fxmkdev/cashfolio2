import { toMoney } from "../../shared/money";
import { applyHoldingAccountExecution } from "./account-finalization";
import { prepareMixedPeriodSameUnitHoldingTransfer } from "./mixed-transfer";
import { buildHoldingReplayOperations } from "./replay-operations";
import type { ReplayOperation, TransferReplay } from "./replay-types";
import {
  applyHoldingTransfer,
  resolveHoldingTransferDirection,
} from "./transfer";
import type {
  HoldingAccountState,
  HoldingExecutionEvent,
  HoldingTransactionBooking,
  ReplayHoldingExecutionsArgs,
} from "./types";
import { toHoldingUnitIdentifier } from "./unit-identity";

/** Consume pending executions without valuing open lots, allowing chronological transfers. */
export async function applyPendingHoldingExecutions(
  args: ReplayHoldingExecutionsArgs,
) {
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
  const carryApplications: CarryApplications = new Map();
  for (const operation of operations) {
    if (operation.execution)
      execute(operation.execution.state, operation.execution.event);
    else if (operation.carry)
      await applyCarryReplay(args, operation, carryApplications);
    else await applyTransferReplay(args, operation, execute);
  }
  for (const state of args.state.stateByHoldingAccountId.values())
    state.executionEvents = [];
  args.state.holdingTransfers = [];
  args.state.holdingCarries = [];
}

type CarryApplications = Map<
  HoldingTransactionBooking[],
  Awaited<ReturnType<typeof prepareMixedPeriodSameUnitHoldingTransfer>>
>;
type ExecuteHoldingEvent = (
  state: HoldingAccountState,
  event: HoldingExecutionEvent,
) => void;
async function applyCarryReplay(
  args: ReplayHoldingExecutionsArgs,
  operation: Extract<ReplayOperation, { carry: HoldingTransactionBooking[] }>,
  carryApplications: CarryApplications,
) {
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
}

async function applyTransferReplay(
  args: ReplayHoldingExecutionsArgs,
  operation: Extract<ReplayOperation, { transfer: TransferReplay }>,
  execute: ExecuteHoldingEvent,
) {
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
  } else await applyTransferFallback(args, bookings, execute);
}

async function applyTransferFallback(
  args: ReplayHoldingExecutionsArgs,
  bookings: HoldingTransactionBooking[],
  execute: ExecuteHoldingEvent,
) {
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
