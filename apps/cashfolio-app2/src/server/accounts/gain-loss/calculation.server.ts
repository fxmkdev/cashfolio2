import { type AccountGainLossDiagnostic } from "../../../shared/accounts/account-gain-loss";
import {
  applyHoldingTransactionsToGainLossState,
  applyPendingHoldingExecutions,
  finalizeHoldingGainLossState,
  initializeHoldingGainLossState,
} from "../../holdings/engine.server";
import { addRunningUnrealizedGainLoss } from "../../holdings/explain";
import type {
  ComputeHoldingGainLossArgs as CalculationArgs,
  HoldingAccountState,
} from "../../holdings/types";
import {
  createAccountBasisResults,
  createBasisSkippedCallback,
  getTransferPeers,
  indexAffectedHoldingAccounts,
  markUnavailableHoldings,
  propagateTransferBasisFailures,
} from "./basis-diagnostics.server";
import { prefetchAccountGainLossConversions } from "./prefetch.server";
import { createAccountValuationCallbacks } from "./valuation-details";
import {
  applyAccountValuationAvailability,
  cloneAccountGainLossHoldings,
  createAccountValuationResults,
  prepareAccountClosingRates,
} from "./valuation-state.server";

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
  const results = createAccountBasisResults(args.holdingAccounts);
  const basisFailures = new Set<string>();
  markUnavailableHoldings(args, results, basisFailures);
  const transferPeers = getTransferPeers(
    args.holdingAccounts,
    args.transactions,
  );
  const accountsByBookingId = indexAffectedHoldingAccounts(
    args.transactions,
    results,
  );
  const onSkippedItem = createBasisSkippedCallback(
    results,
    basisFailures,
    accountsByBookingId,
  );
  const state = await initializeHoldingGainLossState({
    ...args,
    onSkippedItem,
  });
  const convertBookingToReference = await prefetchAccountGainLossConversions({
    ...args,
    state,
  });
  state.convertBookingToReference = convertBookingToReference;
  await applyHoldingTransactionsToGainLossState({
    ...args,
    state,
    convertBookingToReference,
    onSkippedItem,
  });
  await applyPendingHoldingExecutions({
    state,
    captureLotMatches: !!args.detailAccountId,
    onSkippedItem,
  });
  propagateTransferBasisFailures(
    results,
    basisFailures,
    transferPeers,
    args.periodEnd,
  );
  return {
    holdings: [...state.stateByHoldingAccountId].map(([id, accountState]) => ({
      state: accountState,
      diagnostics: results.get(id)!.diagnostics,
      unavailable: basisFailures.has(id),
    })),
  } satisfies AccountGainLossBasis;
}

type AccountBasisValuationArgs = {
  basis: AccountGainLossBasis;
  periodEnd: Date;
  resolveRate: CalculationArgs["resolveRate"];
  detailAccountId?: string;
};

/** Revalue a private copy; replay state and cached snapshots are never mutated. */
export async function valueAccountGainLossBasis(
  args: AccountBasisValuationArgs,
) {
  const holdings = cloneAccountGainLossHoldings(args.basis);
  const results = createAccountValuationResults(holdings);
  const closingFailures = new Set<string>();
  const detail = createAccountValuationCallbacks(
    results,
    closingFailures,
    args.detailAccountId,
  );
  // The basis has already been published; only closing dependencies are warmed here.
  const resolveRate = await prepareAccountClosingRates(
    holdings,
    args.periodEnd,
    args.resolveRate,
  );
  await finalizeHoldingGainLossState({
    state: {
      stateByHoldingAccountId: new Map(
        holdings.map(({ state }) => [state.account.id, state]),
      ),
      skippedCount: 0,
      convertedCount: 0,
    },
    periodEnd: args.periodEnd,
    resolveRate,
    ...detail.callbacks,
  });
  applyAccountValuationAvailability(holdings, results, closingFailures);
  const { realizedEvents, unrealizedOpenLots, unvaluedOpenLots } = detail;
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
