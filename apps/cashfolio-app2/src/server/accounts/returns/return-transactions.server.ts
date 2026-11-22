import type {
  ReturnPreparationArgs,
  ReturnTransactionContext,
  PreparedReturnTransactions,
  ReturnMovement,
} from "./return-transaction-types";
import type { HoldingTransactionBooking } from "../../holdings/types";
import type { Money } from "../../../shared/money";
import { checkResourceBudget } from "../../resource-context.server";
import { decomposeHoldingTransaction } from "../../holdings/transactions";
import { prepareRecordedAdjustment } from "./return-recorded-adjustments.server";
import { prepareTransferMovements } from "./return-transfer-movements.server";
import { prepareResidualMovements } from "./return-execution-movements.server";

const day = (date: Date) => date.toISOString().slice(0, 10);
function createTransactionContext(
  args: ReturnPreparationArgs,
): ReturnTransactionContext {
  const result: PreparedReturnTransactions = {
    changes: [],
    movements: [],
    bridges: [],
    failures: new Map(),
    recordedAccountIds: new Set(),
  };
  const accountIds = new Set(args.accounts.map((account) => account.id));
  const fail = (ids: string[], message: string) => {
    for (const id of ids)
      result.failures.getOrInsertComputed(id, () => []).push(message);
  };
  const convert = async (booking: HoldingTransactionBooking) => {
    const amount = await args.convert(booking);
    if (amount === null)
      fail([booking.accountId], "A capital movement could not be valued.");
    return amount;
  };
  const movement = (
    booking: HoldingTransactionBooking,
    amount: Money,
    suffix = "",
    peerId?: string,
  ): ReturnMovement => ({
    id: `${booking.id}${suffix}`,
    accountId: booking.accountId,
    peerId,
    date: day(booking.date),
    amount,
    transactionId: booking.transactionId ?? null,
    description:
      booking.description ||
      booking.transactionDescription ||
      "Capital movement",
  });
  return {
    referenceCurrency: args.referenceCurrency,
    startDate: args.startDate,
    asOfDate: args.asOfDate,
    convert: args.convert,
    result,
    accountIds,
    fail,
    convertCapital: convert,
    movement,
  };
}

/** Financial normalization is shared by leaf, group, and total calculations. */
export async function prepareReturnTransactions(
  args: ReturnPreparationArgs,
): Promise<PreparedReturnTransactions> {
  const context = createTransactionContext(args);
  const { result, accountIds } = context;
  for (const transaction of args.transactions) {
    checkResourceBudget();
    const balances = transaction.bookings.filter((booking) =>
      accountIds.has(booking.accountId),
    );
    for (const booking of balances) {
      if (
        day(booking.date) >= args.startDate &&
        day(booking.date) <= args.asOfDate
      )
        result.changes.push({
          ...booking,
          date: day(booking.date),
          quantity: booking.value,
        });
    }
    const explicit = transaction.bookings.filter(
      (booking) => booking.equityAccountSubtype === "GAIN_LOSS",
    );
    if (explicit.length) {
      await prepareRecordedAdjustment(context, transaction, balances, explicit);
      continue;
    }
    const { transfers, residualBookings } = decomposeHoldingTransaction(
      transaction.bookings,
      accountIds,
    );
    await prepareTransferMovements(context, transfers);
    await prepareResidualMovements(context, residualBookings);
  }
  return result;
}
