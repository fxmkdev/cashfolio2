import {
  moneyAdd,
  moneyDivide,
  moneyIsFinite,
  moneyMultiply,
  moneySubtract,
  moneySum,
  toMoney,
} from "../../../shared/money";
import {
  isNearZero,
  QUANTITY_EPSILON,
  toLotAcquisitionSortKey,
} from "./period-overview-holdings-common";
import type { HoldingTransferDirection } from "./period-overview-holdings-transfer";
import type {
  HoldingAccountState,
  HoldingExecutionEvent,
  HoldingGainLossWorkingState,
  HoldingLot,
  HoldingTransactionBooking,
} from "./period-overview-holdings-types";

type TransferReplay = {
  bookings: HoldingTransactionBooking[];
  batches: HoldingTransactionBooking[][];
  atomic: boolean;
  direction: HoldingTransferDirection | null;
  canTransferLong: boolean;
  canTransferShort: boolean;
  pool: HoldingLot[];
};

type Execution = { state: HoldingAccountState; event: HoldingExecutionEvent };
type ReplayOperation =
  | {
      sortKey: string;
      execution: Execution;
      carry?: never;
      transfer?: never;
      bookings?: never;
    }
  | {
      sortKey: string;
      execution?: never;
      transfer: TransferReplay;
      carry?: never;
      bookings: HoldingTransactionBooking[];
    }
  | {
      sortKey: string;
      carry: HoldingTransactionBooking[];
      execution?: never;
      transfer?: never;
      bookings: HoldingTransactionBooking[];
    };

function bookingSortKey(booking: HoldingTransactionBooking) {
  return toLotAcquisitionSortKey({ date: booking.date, bookingId: booking.id });
}

function scheduleOperations(
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

/** Plan lot movement using booking-date quantities, without pricing or mutating FIFO lots. */
export function buildHoldingReplayOperations(
  state: HoldingGainLossWorkingState,
) {
  const executions = [...state.stateByHoldingAccountId.values()].flatMap(
    (account) =>
      account.skipped
        ? []
        : account.executionEvents.map((event) => ({ state: account, event })),
  );
  const transfers: TransferReplay[] = (state.holdingTransfers ?? []).map(
    (bookings) => {
      const byDate = new Map<number, HoldingTransactionBooking[]>();
      for (const booking of bookings) {
        const batch = byDate.get(booking.date.getTime()) ?? [];
        batch.push(booking);
        byDate.set(booking.date.getTime(), batch);
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
    },
  );

  // Same-date transfers keep their existing atomic ordering. Receipts that precede
  // their source lots also retain that behaviour rather than inventing a basis.
  // Moving one such transfer can change another's available quantity, so replan
  // until no further transfers need atomic treatment. Each pass fixes at least one.
  for (;;) {
    const operations = scheduleOperations(
      executions,
      transfers,
      state.holdingCarries ?? [],
    );
    const quantities = new Map(
      [...state.stateByHoldingAccountId].map(([id, account]) => [
        id,
        moneySum(account.lots.map((lot) => lot.quantity)),
      ]),
    );
    for (const transfer of transfers) {
      transfer.canTransferLong = true;
      transfer.canTransferShort = true;
    }
    for (const operation of operations) {
      if (operation.execution) {
        const { state: account, event } = operation.execution;
        if (
          !isNearZero(event.quantity) &&
          moneyIsFinite(
            moneyDivide(event.effectiveReferenceAmount, event.quantity),
          )
        ) {
          quantities.set(
            account.account.id,
            moneyAdd(quantities.get(account.account.id)!, event.quantity),
          );
        }
        continue;
      }
      if (operation.carry) {
        for (const booking of operation.bookings)
          quantities.set(
            booking.accountId,
            moneyAdd(
              quantities.get(booking.accountId) ?? toMoney(0),
              booking.value,
            ),
          );
        continue;
      }
      const { transfer, bookings } = operation;
      const deltas = new Map<string, ReturnType<typeof toMoney>>();
      const outgoing = new Map<string, ReturnType<typeof toMoney>>();
      const incoming = new Map<string, ReturnType<typeof toMoney>>();
      for (const booking of bookings) {
        const side = booking.value.isNegative() ? outgoing : incoming;
        side.set(
          booking.accountId,
          moneyAdd(side.get(booking.accountId) ?? toMoney(0), booking.value),
        );
        deltas.set(
          booking.accountId,
          moneyAdd(deltas.get(booking.accountId) ?? toMoney(0), booking.value),
        );
      }
      for (const [id, delta] of deltas) {
        const after = moneyAdd(quantities.get(id) ?? toMoney(0), delta);
        if (!transfer.atomic) {
          if (
            outgoing.has(id) &&
            moneyAdd(quantities.get(id) ?? toMoney(0), outgoing.get(id)!).lt(
              -QUANTITY_EPSILON,
            )
          )
            transfer.canTransferLong = false;
          if (
            incoming.has(id) &&
            moneyAdd(quantities.get(id) ?? toMoney(0), incoming.get(id)!).gt(
              QUANTITY_EPSILON,
            )
          )
            transfer.canTransferShort = false;
        }
        quantities.set(id, after);
      }
    }
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
      if (receivesBeforeSource) {
        transfer.atomic = true;
        reschedule = true;
        continue;
      }
      let inTransit = toMoney(0);
      const sign = transfer.direction === "LONG" ? 1 : -1;
      for (const batch of transfer.batches) {
        inTransit = moneySubtract(
          inTransit,
          moneyMultiply(sign, moneySum(batch.map((booking) => booking.value))),
        );
        if (toMoney(inTransit).lt(-QUANTITY_EPSILON)) {
          transfer.atomic = true;
          reschedule = true;
          break;
        }
      }
    }
    if (!reschedule) return operations;
  }
}
