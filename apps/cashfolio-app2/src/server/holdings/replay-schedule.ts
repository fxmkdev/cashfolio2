import { toLotAcquisitionSortKey } from "./common";
import type {
  Execution,
  ReplayOperation,
  TransferReplay,
} from "./replay-types";
import type { HoldingTransactionBooking } from "./types";
function bookingSortKey(booking: HoldingTransactionBooking) {
  return toLotAcquisitionSortKey({ date: booking.date, bookingId: booking.id });
}

export function scheduleOperations(
  executions: Execution[],
  transfers: TransferReplay[],
  carries: HoldingTransactionBooking[][],
) {
  const operations: ReplayOperation[] = executions.map((execution) => ({
    sortKey: toLotAcquisitionSortKey({
      date: execution.event.date,
      bookingId: execution.event.bookingId,
    }),
    execution,
  }));
  for (const transfer of transfers) {
    for (const bookings of transfer.atomic
      ? [transfer.bookings]
      : transfer.batches) {
      operations.push({
        sortKey: bookings.map(bookingSortKey).sort().at(-1)!,
        transfer,
        bookings,
      });
    }
  }
  for (const carry of carries) {
    for (const booking of carry) {
      operations.push({
        sortKey: bookingSortKey(booking),
        carry,
        bookings: [booking],
      });
    }
  }
  // A split booking's transfer/carry consumes FIFO before its execution remainder.
  const transferSortKeys = new Map<string, string>();
  for (const operation of operations) {
    for (const booking of operation.bookings ?? []) {
      const existing = transferSortKeys.get(booking.id);
      if (!existing || operation.sortKey > existing)
        transferSortKeys.set(booking.id, operation.sortKey);
    }
  }
  for (const operation of operations) {
    if (!operation.execution) continue;
    const key = transferSortKeys.get(operation.execution.event.bookingId);
    if (key && key > operation.sortKey) operation.sortKey = key;
  }
  return operations.sort(
    (left, right) =>
      left.sortKey.localeCompare(right.sortKey, "en") ||
      Number(!!left.execution) - Number(!!right.execution),
  );
}
