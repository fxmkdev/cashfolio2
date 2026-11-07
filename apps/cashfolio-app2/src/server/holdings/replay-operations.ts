import {
  moneyMultiply,
  moneySubtract,
  moneySum,
  toMoney,
} from "../../shared/money";
import { QUANTITY_EPSILON } from "./quantity-policy";
import { simulateReplayQuantities } from "./replay-quantities";
import { scheduleOperations } from "./replay-schedule";
import type { TransferReplay } from "./replay-types";
import type {
  HoldingGainLossWorkingState,
  HoldingTransactionBooking,
} from "./types";

/** Replan until receipts and in-transit quantities allow chronological transfer replay. */
export function buildHoldingReplayOperations(
  state: HoldingGainLossWorkingState,
) {
  const executions = [...state.stateByHoldingAccountId.values()].flatMap(
    (account) =>
      account.skipped
        ? []
        : account.executionEvents.map((event) => ({ state: account, event })),
  );

  const transfers = (state.holdingTransfers ?? []).map(createTransferReplay);
  // Each pass makes at least one transfer atomic; same-date atomic ordering is retained.
  for (;;) {
    const operations = scheduleOperations(
      executions,
      transfers,
      state.holdingCarries ?? [],
    );
    simulateReplayQuantities(state, transfers, operations);
    if (!rescheduleTransfers(transfers)) return operations;
  }
}

function createTransferReplay(
  bookings: HoldingTransactionBooking[],
): TransferReplay {
  const byDate = new Map<number, HoldingTransactionBooking[]>();
  for (const booking of bookings) {
    byDate.getOrInsertComputed(booking.date.getTime(), () => []).push(booking);
  }
  const batches = [...byDate]
    .sort(([left], [right]) => left - right)
    .map(([, batch]) =>
      batch.sort((left, right) => left.id.localeCompare(right.id, "en")),
    );
  return {
    bookings,
    batches,
    atomic: batches.length === 1,
    direction: null,
    canTransferLong: true,
    canTransferShort: true,
    pool: [],
  };
}

function rescheduleTransfers(transfers: TransferReplay[]): boolean {
  let reschedule = false;
  for (const transfer of transfers) {
    if (transfer.atomic) continue;
    transfer.direction =
      transfer.canTransferLong === transfer.canTransferShort
        ? null
        : transfer.canTransferLong
          ? "LONG"
          : "SHORT";
    if (!transfer.direction) continue;

    if (requiresAtomicReplay(transfer)) {
      transfer.atomic = true;
      reschedule = true;
    }
  }
  return reschedule;
}

function requiresAtomicReplay(transfer: TransferReplay): boolean {
  const byId = new Map(
    transfer.bookings.map((booking) => [booking.id, booking]),
  );
  const receivesBeforeSource = transfer.bookings.some((booking) => {
    const isReceipt =
      transfer.direction === "LONG"
        ? booking.value.isPositive()
        : booking.value.isNegative();
    return (
      isReceipt &&
      booking.transferPeers?.some(
        (peer) => byId.get(peer.bookingId)!.date > booking.date,
      )
    );
  });

  if (receivesBeforeSource) return true;
  let inTransit = toMoney(0);
  const sign = transfer.direction === "LONG" ? 1 : -1;
  for (const batch of transfer.batches) {
    inTransit = moneySubtract(
      inTransit,
      moneyMultiply(sign, moneySum(batch.map((booking) => booking.value))),
    );
    if (toMoney(inTransit).lt(-QUANTITY_EPSILON)) {
      return true;
    }
  }
  return false;
}
