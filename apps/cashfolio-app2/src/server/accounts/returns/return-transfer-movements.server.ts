import type { decomposeHoldingTransaction } from "../../holdings/transactions";
import type { ReturnTransactionContext } from "./return-transaction-types";
const day = (date: Date) => date.toISOString().slice(0, 10);
export async function prepareTransferMovements(
  context: ReturnTransactionContext,
  transfers: ReturnType<typeof decomposeHoldingTransaction>["transfers"],
) {
  const { result, convertCapital: convert, movement } = context;
  for (const transfer of transfers) {
    const byId = new Map(transfer.map((booking) => [booking.id, booking]));
    for (const outgoing of transfer.filter((booking) =>
      booking.value.isNegative(),
    )) {
      for (const peer of outgoing.transferPeers ?? []) {
        const incoming = byId.get(peer.bookingId)!;
        result.bridges.push({
          ...outgoing,
          fromId: outgoing.accountId,
          toId: incoming.accountId,
          fromDate: day(outgoing.date),
          toDate: day(incoming.date),
          quantity: peer.quantity,
        });
        for (const [booking, quantity, other] of [
          [outgoing, peer.quantity.neg(), incoming],
          [incoming, peer.quantity, outgoing],
        ] as const) {
          if (
            day(booking.date) < context.startDate ||
            day(booking.date) > context.asOfDate
          )
            continue;
          const amount = await convert({ ...booking, value: quantity });
          if (amount !== null)
            result.movements.push(
              movement(booking, amount, `:${other.id}`, other.accountId),
            );
        }
      }
    }
  }
}
