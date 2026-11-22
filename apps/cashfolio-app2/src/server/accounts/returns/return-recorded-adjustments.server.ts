import type {
  HoldingTransaction,
  HoldingTransactionBooking,
} from "../../holdings/types";
import type { ReturnTransactionContext } from "./return-transaction-types";
const day = (date: Date) => date.toISOString().slice(0, 10);

export async function prepareRecordedAdjustment(
  context: ReturnTransactionContext,
  transaction: HoldingTransaction,
  balances: HoldingTransactionBooking[],
  explicit: HoldingTransactionBooking[],
) {
  const { result, fail } = context;
  const ids = [...new Set(balances.map((booking) => booking.accountId))];
  if (
    ids.length === 1 &&
    explicit.some(
      (booking) =>
        day(booking.date) >= context.startDate &&
        day(booking.date) <= context.asOfDate,
    )
  )
    result.recordedAccountIds.add(ids[0]!);
  if (
    balances.length !== 1 ||
    explicit.length !== 1 ||
    transaction.bookings.length !== 2
  ) {
    fail(ids, "A recorded G/L transaction has ambiguous capital movements.");
    return;
  }
  await applyRecordedAdjustment(context, balances[0]!, explicit[0]!, ids);
}
async function applyRecordedAdjustment(
  context: ReturnTransactionContext,
  counterpart: HoldingTransactionBooking,
  gain: HoldingTransactionBooking,
  ids: string[],
) {
  const { result, fail, convertCapital: convert, movement } = context;
  const gainQuantity = gain.value.neg();
  // A dated adjustment is performance on its equity date, even before settlement.
  result.bridges.push({
    ...gain,
    fromId: counterpart.accountId,
    toId: counterpart.accountId,
    fromDate: day(gain.date),
    toDate: day(counterpart.date),
    quantity: gainQuantity,
  });
  if (
    day(counterpart.date) < context.startDate ||
    day(counterpart.date) > context.asOfDate
  )
    return;
  const raw = await convert(counterpart);
  const performance = await context.convert({
    ...gain,
    date: counterpart.date,
    value: gainQuantity,
  });
  if (performance === null)
    fail(ids, "A recorded G/L adjustment could not be valued.");
  if (raw !== null && performance !== null)
    result.movements.push(movement(counterpart, raw.minus(performance)));
}
