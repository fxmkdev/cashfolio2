import { type Money, MoneyDecimal } from "../../../shared/money";
import type { ReturnAccount } from "../../../shared/accounts/account-return-groups";
import type {
  HoldingTransaction,
  HoldingTransactionBooking,
  HoldingGainLossWorkingState,
  HoldingBookingConverter,
} from "../../holdings/types";
import {
  decomposeHoldingTransaction,
  applyHoldingTransactionExecutionPricing,
  toHoldingUnitIdentifier,
} from "../../holdings/transactions";
import { checkResourceBudget } from "../../resource-context.server";

type UnitIdentity = Pick<
  HoldingTransactionBooking,
  "unit" | "currency" | "cryptocurrency" | "symbol" | "tradeCurrency"
>;
export type ReturnPositionChange = UnitIdentity & {
  accountId: string;
  date: string;
  quantity: Money;
};
export type ReturnMovement = {
  id: string;
  accountId: string;
  peerId?: string;
  date: string;
  amount: Money;
  transactionId: string | null;
  description: string;
};
export type ReturnBridge = UnitIdentity & {
  fromId: string;
  toId: string;
  fromDate: string;
  toDate: string;
  quantity: Money;
};
export type PreparedReturnTransactions = {
  changes: ReturnPositionChange[];
  movements: ReturnMovement[];
  bridges: ReturnBridge[];
  failures: Map<string, string[]>;
  recordedAccountIds: Set<string>;
};
const day = (date: Date) => date.toISOString().slice(0, 10);

/** Financial normalization is shared by leaf, group, and total calculations. */
export async function prepareReturnTransactions(args: {
  accounts: ReturnAccount[];
  transactions: HoldingTransaction[];
  referenceCurrency: string;
  startDate: string;
  asOfDate: string;
  convert: HoldingBookingConverter;
}): Promise<PreparedReturnTransactions> {
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
      const ids = [...new Set(balances.map((booking) => booking.accountId))];
      if (
        ids.length === 1 &&
        explicit.some(
          (booking) =>
            day(booking.date) >= args.startDate &&
            day(booking.date) <= args.asOfDate,
        )
      )
        result.recordedAccountIds.add(ids[0]!);
      if (
        balances.length !== 1 ||
        explicit.length !== 1 ||
        transaction.bookings.length !== 2
      ) {
        fail(
          ids,
          "A recorded G/L transaction has ambiguous capital movements.",
        );
        continue;
      }
      const counterpart = balances[0]!;
      const gain = explicit[0]!;
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
        day(counterpart.date) < args.startDate ||
        day(counterpart.date) > args.asOfDate
      )
        continue;
      const raw = await convert(counterpart);
      const performance = await args.convert({
        ...gain,
        date: counterpart.date,
        value: gainQuantity,
      });
      if (performance === null)
        fail(ids, "A recorded G/L adjustment could not be valued.");
      if (raw !== null && performance !== null)
        result.movements.push(movement(counterpart, raw.minus(performance)));
      continue;
    }
    const { transfers, residualBookings } = decomposeHoldingTransaction(
      transaction.bookings,
      accountIds,
    );
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
              day(booking.date) < args.startDate ||
              day(booking.date) > args.asOfDate
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
    const residualBalances = residualBookings.filter((booking) =>
      accountIds.has(booking.accountId),
    );
    if (!residualBalances.length) continue;
    if (residualBookings.some((booking) => day(booking.date) > args.asOfDate)) {
      fail(
        residualBalances.map((booking) => booking.accountId),
        "A transaction is partially posted at the as-of date.",
      );
      continue;
    }
    const holdings = residualBalances.filter(
      (booking) =>
        !(
          booking.unit === "CURRENCY" &&
          booking.currency?.toUpperCase() === args.referenceCurrency
        ),
    );
    const state: HoldingGainLossWorkingState = {
      stateByHoldingAccountId: new Map(
        holdings.map((booking) => [
          booking.accountId,
          {
            account: { ...booking, id: booking.accountId },
            lots: [],
            executionEvents: [],
            skipped: false,
          },
        ]),
      ),
      skippedCount: 0,
      convertedCount: 0,
    };
    if (holdings.length)
      await applyHoldingTransactionExecutionPricing({
        state,
        inPeriodHoldingBookings: holdings,
        allNonExplicitBookings: residualBookings,
        allNonExplicitAreHolding: holdings.length === residualBookings.length,
        nonExplicitUnitIdentifiers: new Set(
          residualBookings.map(toHoldingUnitIdentifier),
        ),
        convertBookingToReference: args.convert,
        onSkippedItem: () =>
          fail(
            residualBalances.map((booking) => booking.accountId),
            "Execution pricing is incomplete.",
          ),
      });
    const executions = new Map(
      [...state.stateByHoldingAccountId.values()]
        .flatMap((item) => item.executionEvents)
        .map((event) => [event.bookingId, event]),
    );
    const movements: ReturnMovement[] = [];
    for (const booking of residualBalances) {
      const amount = holdings.includes(booking)
        ? executions.get(booking.id)?.effectiveReferenceAmount
        : await convert(booking);
      if (amount != null) movements.push(movement(booking, amount));
    }
    // Match internal trade consideration, retaining unpaired income/fees as neutral capital.
    const remaining = movements.map((item) => ({ ...item }));
    for (const outgoing of remaining.filter((item) =>
      item.amount.isNegative(),
    )) {
      for (const incoming of remaining.filter(
        (item) =>
          item.amount.isPositive() && item.accountId !== outgoing.accountId,
      )) {
        if (!outgoing.amount.isNegative()) break;
        const amount = MoneyDecimal.min(outgoing.amount.neg(), incoming.amount);
        if (amount.isZero()) continue;
        result.movements.push(
          {
            ...outgoing,
            id: `${outgoing.id}:${incoming.id}`,
            amount: amount.neg(),
            peerId: incoming.accountId,
          },
          {
            ...incoming,
            id: `${incoming.id}:${outgoing.id}`,
            amount,
            peerId: outgoing.accountId,
          },
        );
        result.bridges.push({
          unit: "CURRENCY",
          currency: args.referenceCurrency,
          cryptocurrency: null,
          symbol: null,
          tradeCurrency: null,
          fromId: outgoing.accountId,
          toId: incoming.accountId,
          fromDate: outgoing.date,
          toDate: incoming.date,
          quantity: amount,
        });
        outgoing.amount = outgoing.amount.plus(amount);
        incoming.amount = incoming.amount.minus(amount);
      }
    }
    result.movements.push(...remaining.filter((item) => !item.amount.isZero()));
  }
  return result;
}
