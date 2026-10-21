import {
  MoneyDecimal,
  moneyAbs,
  moneySubtract,
  toMoney,
  type Money,
} from "../../../shared/money";
import {
  isExplicitGainLossBooking,
  isNearZero,
} from "./period-overview-holdings-common";
import { toHoldingUnitIdentifier } from "./period-overview-holdings-transfer";
import type { HoldingTransactionBooking } from "./period-overview-holdings-types";

type TransferPeer = { bookingId: string; quantity: Money };
type Edge = { to: number; reverse: number; remaining: Money };

/** Maximum cross-account matching; residual edges allow an earlier pairing to be rerouted. */
function matchQuantities(bookings: HoldingTransactionBooking[]) {
  const negative = bookings.filter((booking) => booking.value.isNegative());
  const positive = bookings.filter((booking) => booking.value.isPositive());
  const sink = negative.length + positive.length + 1;
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => []);
  const addEdge = (from: number, to: number, capacity: Money) => {
    const forward = { to, reverse: graph[to]!.length, remaining: capacity };
    graph[from]!.push(forward);
    graph[to]!.push({
      to: from,
      reverse: graph[from]!.length - 1,
      remaining: toMoney(0),
    });
    return forward;
  };
  const sourceEdges = negative.map((booking, index) =>
    addEdge(0, index + 1, moneyAbs(booking.value)),
  );
  const sinkEdges = positive.map((booking, index) =>
    addEdge(negative.length + index + 1, sink, booking.value),
  );
  const pairEdges: {
    outgoing: HoldingTransactionBooking;
    incoming: HoldingTransactionBooking;
    edge: Edge;
  }[] = [];
  for (const [left, outgoing] of negative.entries()) {
    for (const [right, incoming] of positive.entries()) {
      if (outgoing.accountId !== incoming.accountId) {
        const edge = addEdge(
          left + 1,
          negative.length + right + 1,
          MoneyDecimal.min(moneyAbs(outgoing.value), incoming.value),
        );
        pairEdges.push({ outgoing, incoming, edge });
      }
    }
  }
  for (;;) {
    const parents = new Map<number, { from: number; edge: Edge }>();
    const queue = [0];
    for (
      let index = 0;
      index < queue.length && !parents.has(sink);
      index += 1
    ) {
      const from = queue[index]!;
      for (const edge of graph[from]!) {
        if (edge.to === 0 || parents.has(edge.to) || isNearZero(edge.remaining))
          continue;
        parents.set(edge.to, { from, edge });
        queue.push(edge.to);
      }
    }
    if (!parents.has(sink)) break;
    let quantity = parents.get(sink)!.edge.remaining;
    for (let node = sink; node !== 0;) {
      const parent = parents.get(node)!;
      quantity = MoneyDecimal.min(quantity, parent.edge.remaining);
      node = parent.from;
    }
    for (let node = sink; node !== 0;) {
      const { from, edge } = parents.get(node)!;
      edge.remaining = moneySubtract(edge.remaining, quantity);
      const reverse = graph[node]![edge.reverse]!;
      reverse.remaining = reverse.remaining.plus(quantity);
      node = from;
    }
  }
  const peers = new Map<string, TransferPeer[]>();
  for (const { outgoing, incoming, edge } of pairEdges) {
    const quantity = graph[edge.to]![edge.reverse]!.remaining;
    if (isNearZero(quantity)) continue;
    for (const [booking, other] of [
      [outgoing, incoming],
      [incoming, outgoing],
    ] as const) {
      const matches = peers.get(booking.id) ?? [];
      matches.push({ bookingId: other.id, quantity });
      peers.set(booking.id, matches);
    }
  }
  const quantities = new Map([
    ...negative.map(
      (booking, index) =>
        [
          booking.id,
          moneySubtract(
            moneyAbs(booking.value),
            sourceEdges[index]!.remaining,
          ).neg(),
        ] as const,
    ),
    ...positive.map(
      (booking, index) =>
        [
          booking.id,
          moneySubtract(booking.value, sinkEdges[index]!.remaining),
        ] as const,
    ),
  ]);
  return { quantities, peers };
}

/** Split holding quantities from their execution counterparts without changing persisted bookings. */
export function decomposeHoldingTransaction(
  bookings: HoldingTransactionBooking[],
  holdingAccountIds: ReadonlySet<string>,
) {
  const groups = new Map<string, HoldingTransactionBooking[]>();
  const nonExplicit = bookings.filter(
    (booking) => !isExplicitGainLossBooking(booking),
  );
  for (const booking of nonExplicit) {
    const unit = toHoldingUnitIdentifier(booking);
    if (
      !holdingAccountIds.has(booking.accountId) ||
      (booking.accountType !== "ASSET" &&
        booking.accountType !== "LIABILITY") ||
      !unit ||
      isNearZero(booking.value)
    )
      continue;
    const group = groups.get(unit) ?? [];
    group.push(booking);
    groups.set(unit, group);
  }
  const matched = new Map<string, Money>();
  const transfers: HoldingTransactionBooking[][] = [];
  for (const group of groups.values()) {
    group.sort(
      (left, right) =>
        left.date.getTime() - right.date.getTime() ||
        left.id.localeCompare(right.id, "en"),
    );
    const { quantities, peers } = matchQuantities(group);
    const transfer = group.flatMap((booking) => {
      const value = quantities.get(booking.id)!;
      if (isNearZero(value)) return [];
      matched.set(booking.id, value);
      return [{ ...booking, value, transferPeers: peers.get(booking.id) }];
    });
    if (transfer.length) transfers.push(transfer);
  }
  const residualBookings = nonExplicit.flatMap((booking) => {
    const quantity = matched.get(booking.id);
    if (quantity == null) return [booking];
    const value = moneySubtract(booking.value, quantity);
    return isNearZero(value) ? [] : [{ ...booking, value }];
  });
  return { transfers, residualBookings };
}
