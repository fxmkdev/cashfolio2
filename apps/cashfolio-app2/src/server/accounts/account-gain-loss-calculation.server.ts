import { toMoney, moneyAdd, type Money } from "../../shared/money";
import {
  EMPTY_GAIN_LOSS_SUMMARY,
  type AccountGainLossResult,
  type AccountGainLossDiagnostic,
} from "../../shared/account-gain-loss";
import {
  initializeHoldingGainLossState,
  applyHoldingTransactionsToGainLossState,
  finalizeHoldingGainLossState,
  type computeHoldingGainLossSplit,
} from "../period/holdings/period-overview-holdings";
import { applyPendingHoldingExecutions } from "../period/holdings/holding-executions";
import type {
  HoldingAccountState,
  HoldingSkippedItem,
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

export type AccountGainLossBasis = {
  holdings: {
    state: HoldingAccountState;
    diagnostics: AccountGainLossDiagnostic[];
    unavailable: boolean;
  }[];
};

type AccountCalculationArgs = CalculationArgs & {
  detailAccountId?: string;
  unavailableHoldings?: string[];
};

/** Price and replay all executions and transfers, without looking up closing prices. */
export async function replayAccountGainLossBasis(args: AccountCalculationArgs) {
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
  const transferPeers = getTransferPeers(
    args.holdingAccounts,
    args.transactions,
  );
  const accountsByBookingId = new Map<string, string[]>();
  for (const transaction of args.transactions) {
    const affected = transaction.bookings
      .filter((booking) => results.has(booking.accountId))
      .map((booking) => booking.accountId);
    for (const booking of transaction.bookings)
      accountsByBookingId.set(booking.id, affected);
  }
  const onSkippedItem = (item: HoldingSkippedItem) => {
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
  const state = await initializeHoldingGainLossState({
    ...args,
    onSkippedItem,
  });
  state.chronological = true;
  state.convertBookingToReference = args.convertBookingToReference;
  await applyHoldingTransactionsToGainLossState({
    ...args,
    state,
    onSkippedItem,
  });
  await applyPendingHoldingExecutions({
    state,
    captureLotMatches: !!args.detailAccountId,
    onSkippedItem,
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
  return {
    holdings: [...state.stateByHoldingAccountId].map(([id, accountState]) => ({
      state: accountState,
      diagnostics: results.get(id)!.diagnostics,
      unavailable: basisFailures.has(id),
    })),
  } satisfies AccountGainLossBasis;
}

/** Revalue a private copy; replay state and cached snapshots are never mutated. */
export async function valueAccountGainLossBasis(args: {
  basis: AccountGainLossBasis;
  periodEnd: Date;
  resolveRate: CalculationArgs["resolveRate"];
  detailAccountId?: string;
}) {
  const holdings = args.basis.holdings.map((holding) => ({
    ...holding,
    state: {
      ...holding.state,
      lots: holding.state.lots.map((lot) => ({ ...lot })),
      executionEvents: [],
      processedExecutionEvents: [
        ...(holding.state.processedExecutionEvents ?? []),
      ],
    },
  }));
  const results = new Map<string, AccountGainLossResult<Money>>(
    holdings.map(({ state, diagnostics }) => [
      state.account.id,
      {
        applicable: true,
        summary: {
          realizedGainLoss: toMoney(0),
          unrealizedGainLoss: toMoney(0),
          totalGainLoss: toMoney(0),
        },
        diagnostics: [...diagnostics],
      },
    ]),
  );
  const closingFailures = new Set<string>();
  const realizedEvents: GainLossReconciliationRealizedEvent<Money>[] = [];
  const unrealizedOpenLots: GainLossReconciliationOpenLot<Money>[] = [];
  const unvaluedOpenLots: GainLossReconciliationOpenLot<Money, null>[] = [];
  await finalizeHoldingGainLossState({
    state: {
      stateByHoldingAccountId: new Map(
        holdings.map(({ state }) => [state.account.id, state]),
      ),
      skippedCount: 0,
      convertedCount: 0,
    },
    periodEnd: args.periodEnd,
    resolveRate: args.resolveRate,
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
      closingFailures.add(item.accountId);
      results.get(item.accountId)!.diagnostics.push({
        date: item.date.toISOString(),
        message:
          "Closing valuation is unavailable. Realised G/L remains available.",
      });
    },
  });
  for (const { state, unavailable } of holdings) {
    const result = results.get(state.account.id)!;
    if (unavailable) result.summary = { ...EMPTY_GAIN_LOSS_SUMMARY };
    else if (closingFailures.has(state.account.id))
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

/** Summary and detail requests share exactly the same replay and valuation stages. */
export async function calculateAccountGainLoss(
  args: AccountCalculationArgs & {
    onBasis?: (basis: AccountGainLossBasis) => Promise<void>;
  },
) {
  const basis = await replayAccountGainLossBasis(args);
  await args.onBasis?.(basis);
  return valueAccountGainLossBasis({ ...args, basis });
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
