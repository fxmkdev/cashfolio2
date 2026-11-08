import type { Money } from "../../shared/money";
import {
  moneyAdd,
  moneyDivide,
  moneyIsFinite,
  moneySum,
  toMoney,
} from "../../shared/money";
import { isNearZero, QUANTITY_EPSILON } from "./quantity-policy";
import type { ReplayOperation, TransferReplay } from "./replay-types";
import type { HoldingGainLossWorkingState } from "./types";

export function simulateReplayQuantities(
  state: HoldingGainLossWorkingState,
  transfers: TransferReplay[],
  operations: ReplayOperation[],
) {
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
  for (const operation of operations)
    applyReplayQuantity(quantities, operation);
}

function applyReplayQuantity(
  quantities: Map<string, Money>,
  operation: ReplayOperation,
) {
  if (operation.execution) {
    const { state: account, event } = operation.execution;
    if (
      !isNearZero(event.quantity) &&
      moneyIsFinite(moneyDivide(event.effectiveReferenceAmount, event.quantity))
    ) {
      quantities.set(
        account.account.id,
        moneyAdd(quantities.get(account.account.id)!, event.quantity),
      );
    }
    return;
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
    return;
  }
  applyTransferQuantityDeltas(quantities, operation);
}

function applyTransferQuantityDeltas(
  quantities: Map<string, Money>,
  operation: Extract<ReplayOperation, { transfer: TransferReplay }>,
) {
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
