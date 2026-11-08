import type { AccountGainLossResult } from "../../../shared/accounts/account-gain-loss";
import { toMoney, type Money } from "../../../shared/money";
import { decomposeHoldingTransaction } from "../../holdings/transactions";
import type {
  HoldingRateConvertibleAccount,
  HoldingSkippedItem,
  HoldingTransaction,
} from "../../holdings/types";
import { checkResourceBudget } from "../../resource-context.server";
type BasisResults = Map<string, AccountGainLossResult<Money>>;
export function createAccountBasisResults(
  holdingAccounts: HoldingRateConvertibleAccount[],
) {
  const results = new Map<string, AccountGainLossResult<Money>>(
    holdingAccounts.map((account) => [
      account.id,
      {
        applicable: true,
        summary: {
          realizedGainLoss: toMoney(0),
          unrealizedGainLoss: toMoney(0),
          totalGainLoss: toMoney(0),
        },
        diagnostics: [],
      },
    ]),
  );
  return results;
}

export function markUnavailableHoldings(
  args: { unavailableHoldings?: string[]; periodEnd: Date },
  results: BasisResults,
  basisFailures: Set<string>,
) {
  for (const accountId of args.unavailableHoldings ?? []) {
    const result = results.get(accountId);
    if (!result) continue;
    basisFailures.add(accountId);
    result.diagnostics.push({
      date: args.periodEnd.toISOString(),
      message:
        "A holding transaction is partially posted at this date; its complete execution basis is unavailable.",
    });
  }
}

export function indexAffectedHoldingAccounts(
  transactions: HoldingTransaction[],
  results: BasisResults,
) {
  const accountsByBookingId = new Map<string, string[]>();
  for (const transaction of transactions) {
    checkResourceBudget();
    const { transfers, residualBookings } = decomposeHoldingTransaction(
      transaction.bookings,
      new Set(results.keys()),
    );
    for (const bookings of [...transfers, residualBookings]) {
      const affected = bookings
        .filter((booking) => results.has(booking.accountId))
        .map((booking) => booking.accountId);
      for (const booking of bookings) {
        accountsByBookingId.set(booking.id, [
          ...new Set([
            ...(accountsByBookingId.get(booking.id) ?? []),
            ...affected,
          ]),
        ]);
      }
    }
  }
  return accountsByBookingId;
}

export function createBasisSkippedCallback(
  results: BasisResults,
  basisFailures: Set<string>,
  accountsByBookingId: Map<string, string[]>,
) {
  return (item: HoldingSkippedItem) => {
    const affected = item.bookingId
      ? (accountsByBookingId.get(item.bookingId) ?? [item.accountId])
      : [item.accountId];
    for (const accountId of affected) {
      const result = results.get(accountId);
      if (!result) continue;
      basisFailures.add(accountId);
      result.diagnostics.push({
        date: item.date.toISOString(),
        message:
          "Opening basis or execution valuation is unavailable. Accumulated G/L cannot be calculated completely.",
      });
    }
  };
}

export function propagateTransferBasisFailures(
  results: BasisResults,
  basisFailures: Set<string>,
  transferPeers: Map<string, Set<string>>,
  periodEnd: Date,
) {
  // A missing basis can affect later sales in any account receiving these lots.
  const pending = [...basisFailures];
  for (let index = 0; index < pending.length; index += 1) {
    for (const peer of transferPeers.get(pending[index]!) ?? []) {
      if (basisFailures.has(peer)) continue;
      basisFailures.add(peer);
      pending.push(peer);
      results.get(peer)!.diagnostics.push({
        date: periodEnd.toISOString(),
        message: "A transferred holding has an incomplete cost basis.",
      });
    }
  }
}

export function getTransferPeers(
  accounts: HoldingRateConvertibleAccount[],
  transactions: HoldingTransaction[],
) {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const peers = new Map<string, Set<string>>();
  for (const transaction of transactions) {
    const { transfers } = decomposeHoldingTransaction(
      transaction.bookings,
      new Set(byId.keys()),
    );
    for (const bookings of transfers) {
      for (const booking of bookings) {
        const connected = peers.getOrInsertComputed(
          booking.accountId,
          () => new Set<string>(),
        );
        for (const other of bookings) connected.add(other.accountId);
      }
    }
  }
  return peers;
}
