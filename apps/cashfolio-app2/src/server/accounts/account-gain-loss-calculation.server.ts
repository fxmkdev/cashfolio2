import { toMoney, moneyAdd, type Money } from "../../shared/money";
import {
  EMPTY_GAIN_LOSS_SUMMARY,
  type AccountGainLossResult,
} from "../../shared/account-gain-loss";
import { computeHoldingGainLossSplit } from "../period/holdings/period-overview-holdings";
import type {
  HoldingRateConvertibleAccount,
  HoldingTransaction,
} from "../period/holdings/period-overview-holdings-types";
import { isExplicitGainLossBooking } from "../period/holdings/period-overview-holdings-common";
import { toHoldingUnitIdentifier } from "../period/holdings/period-overview-holdings-transfer";
import {
  parseAcquisitionSortKey,
  toRoundedOpenLot,
  toRoundedRealizedEvent,
  addRunningUnrealizedGainLoss,
} from "../period/reconciliation/period-gain-loss-reconciliation-shared";
import type {
  GainLossReconciliationOpenLot,
  GainLossReconciliationRealizedEvent,
} from "../period/reconciliation/period-gain-loss-reconciliation-types";

type CalculationArgs = Parameters<typeof computeHoldingGainLossSplit>[0];

/** Shared range replay: summary and details are collected from the same FIFO run. */
export async function calculateAccountGainLoss(
  args: CalculationArgs & {
    detailAccountId?: string;
    unavailableHoldings?: string[];
  },
) {
  const results = new Map<string, AccountGainLossResult<Money>>(
    args.holdingAccounts.map((account) => [
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
  const basisFailures = new Set<string>();
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
  const closingFailures = new Set<string>();
  const transferPeers = getTransferPeers(
    args.holdingAccounts,
    args.transactions,
  );
  const realizedEvents: GainLossReconciliationRealizedEvent<Money>[] = [];
  const unrealizedOpenLots: GainLossReconciliationOpenLot<Money>[] = [];
  const unvaluedOpenLots: GainLossReconciliationOpenLot<Money, null>[] = [];
  const accountsByBookingId = new Map<string, string[]>();
  for (const transaction of args.transactions) {
    const affected = transaction.bookings
      .filter((booking) => results.has(booking.accountId))
      .map((booking) => booking.accountId);
    for (const booking of transaction.bookings)
      accountsByBookingId.set(booking.id, affected);
  }
  await computeHoldingGainLossSplit({
    ...args,
    chronological: true,
    onAccountGainLoss: (item) => {
      results.get(item.accountId)!.summary = {
        realizedGainLoss: item.realizedGainLoss,
        unrealizedGainLoss: item.unrealizedGainLoss,
        totalGainLoss: moneyAdd(item.realizedGainLoss, item.unrealizedGainLoss),
      };
    },
    onAccountExecutionEvent: args.detailAccountId
      ? (event) => {
          if (event.accountId === args.detailAccountId)
            realizedEvents.push(toRoundedRealizedEvent(event, false));
        }
      : undefined,
    onAccountUnvaluedOpenLot: args.detailAccountId
      ? (lot) => {
          if (lot.accountId === args.detailAccountId)
            unvaluedOpenLots.push({
              id: `lot:${lot.acquisitionSortKey}`,
              ...parseAcquisitionSortKey(lot.acquisitionSortKey),
              acquisitionSortKey: lot.acquisitionSortKey,
              quantity: lot.quantity,
              unitCostInReference: lot.unitCostInReference,
              periodEndRate: null,
              unrealizedGainLoss: null,
              runningUnrealizedGainLoss: null,
            });
        }
      : undefined,
    onAccountOpenLotValuation: args.detailAccountId
      ? (lot) => {
          if (lot.accountId === args.detailAccountId)
            unrealizedOpenLots.push(toRoundedOpenLot(lot, false));
        }
      : undefined,
    onSkippedItem: (item) => {
      const affected = item.bookingId
        ? (accountsByBookingId.get(item.bookingId) ?? [item.accountId])
        : [item.accountId];
      for (const accountId of affected) {
        const result = results.get(accountId);
        if (!result) continue;
        const isClosingFailure = item.reason === "missingPeriodEndRate";
        (isClosingFailure ? closingFailures : basisFailures).add(accountId);
        result.diagnostics.push({
          date: item.date.toISOString(),
          message: isClosingFailure
            ? "Closing valuation is unavailable. Realised G/L remains available."
            : "Opening basis or execution valuation is unavailable. Accumulated G/L cannot be calculated completely.",
        });
      }
    },
  });
  // A missing basis can affect later sales in any account receiving these lots.
  const pending = [...basisFailures];
  for (let index = 0; index < pending.length; index += 1) {
    for (const peer of transferPeers.get(pending[index]!) ?? []) {
      if (basisFailures.has(peer)) continue;
      basisFailures.add(peer);
      pending.push(peer);
      results.get(peer)!.diagnostics.push({
        date: args.periodEnd.toISOString(),
        message: "A transferred holding has an incomplete cost basis.",
      });
    }
  }
  for (const [accountId, result] of results) {
    if (basisFailures.has(accountId))
      result.summary = { ...EMPTY_GAIN_LOSS_SUMMARY };
    else if (closingFailures.has(accountId))
      result.summary = {
        ...result.summary,
        unrealizedGainLoss: null,
        totalGainLoss: null,
      };
  }
  return {
    results,
    realizedEvents,
    unrealizedOpenLots: [
      ...addRunningUnrealizedGainLoss(unrealizedOpenLots, false),
      ...unvaluedOpenLots,
    ].sort((a, b) =>
      a.acquisitionSortKey.localeCompare(b.acquisitionSortKey, "en"),
    ),
  };
}

function getTransferPeers(
  accounts: HoldingRateConvertibleAccount[],
  transactions: HoldingTransaction[],
) {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const peers = new Map<string, Set<string>>();
  for (const transaction of transactions) {
    const bookings = transaction.bookings.filter(
      (booking) => !isExplicitGainLossBooking(booking),
    );
    if (
      !bookings.length ||
      bookings.some((booking) => !byId.has(booking.accountId))
    )
      continue;
    const units = new Set(bookings.map(toHoldingUnitIdentifier));
    if (units.size !== 1 || units.has(null)) continue;
    for (const booking of bookings) {
      const connected = peers.get(booking.accountId) ?? new Set<string>();
      for (const other of bookings) connected.add(other.accountId);
      peers.set(booking.accountId, connected);
    }
  }
  return peers;
}
