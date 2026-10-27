import type {
  GainLossReconciliationTarget,
  GainLossReconciliationOpenLot,
  GainLossReconciliationRealizedEvent,
} from "./gain-loss-reconciliation";
import { moneyAdd, toMoney, type MoneyInput } from "./money";

export type AccountGainLossSummary<Amount = number> = {
  realizedGainLoss: Amount | null;
  unrealizedGainLoss: Amount | null;
  totalGainLoss: Amount | null;
};

export type AccountGainLossDiagnostic = {
  date: string;
  message: string;
};

export type AccountGainLossResult<Amount = number> = {
  applicable: boolean;
  summary: AccountGainLossSummary<Amount>;
  diagnostics: AccountGainLossDiagnostic[];
};

export type AccountGainLossSummaries = {
  referenceCurrency: string;
  startDate: string;
  asOfDate: string;
  rows: (AccountGainLossResult & { id: string })[];
  total: AccountGainLossResult;
};

export type AccountGainLossDetails = AccountGainLossResult & {
  referenceCurrency: string;
  startDate: string;
  asOfDate: string;
  accountName: string;
  target: GainLossReconciliationTarget;
  realizedEvents: GainLossReconciliationRealizedEvent[];
  unrealizedOpenLots: GainLossReconciliationOpenLot<number, number | null>[];
};

export const EMPTY_GAIN_LOSS_SUMMARY: AccountGainLossSummary<never> = {
  realizedGainLoss: null,
  unrealizedGainLoss: null,
  totalGainLoss: null,
};

/** Sum leaf results exactly and withhold incomplete components independently. */
export function aggregateAccountGainLoss<Amount extends MoneyInput>(
  results: AccountGainLossResult<Amount>[],
) {
  const applicable = results.filter((result) => result.applicable);
  const sum = (field: keyof AccountGainLossSummary) => {
    if (
      !applicable.length ||
      applicable.some((result) => result.summary[field] == null)
    )
      return null;
    return applicable.reduce(
      (total, result) => moneyAdd(total, result.summary[field]!),
      toMoney(0),
    );
  };
  return {
    applicable: applicable.length > 0,
    summary: {
      realizedGainLoss: sum("realizedGainLoss"),
      unrealizedGainLoss: sum("unrealizedGainLoss"),
      totalGainLoss: sum("totalGainLoss"),
    },
    diagnostics: applicable.flatMap((result) => result.diagnostics),
  };
}
