import {
  EMPTY_GAIN_LOSS_SUMMARY,
  type AccountGainLossResult,
} from "../../../shared/account-gain-loss";
import { toMoney, type Money } from "../../../shared/money";
import { hasOpenHoldingLots } from "../../holdings/engine";
import { toHoldingUnitIdentifier } from "../../holdings/transactions";
import type { HoldingRateResolver } from "../../holdings/types";
import type { AccountGainLossBasis } from "./calculation.server";
type BasisHoldings = AccountGainLossBasis["holdings"];
export function cloneAccountGainLossHoldings(basis: AccountGainLossBasis) {
  const holdings = basis.holdings.map((holding) => ({
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
  return holdings;
}

export function createAccountValuationResults(holdings: BasisHoldings) {
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
  return results;
}

export async function prepareAccountClosingRates(
  holdings: BasisHoldings,
  periodEnd: Date,
  originalResolveRate: HoldingRateResolver,
): Promise<HoldingRateResolver> {
  const closingRateByUnit = new Map<
    string | null,
    ReturnType<HoldingRateResolver>
  >();
  const resolveRate: HoldingRateResolver = (input) => {
    const key = toHoldingUnitIdentifier(input);
    const existing = closingRateByUnit.get(key);
    if (existing) return existing;
    const promise = originalResolveRate(input);
    closingRateByUnit.set(key, promise);
    return promise;
  };
  await Promise.all(
    holdings
      .filter(({ state }) => !state.skipped && hasOpenHoldingLots(state))
      .map(({ state }) => resolveRate({ ...state.account, date: periodEnd })),
  );
  return resolveRate;
}

export function applyAccountValuationAvailability(
  holdings: BasisHoldings,
  results: Map<string, AccountGainLossResult<Money>>,
  closingFailures: Set<string>,
) {
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
}
