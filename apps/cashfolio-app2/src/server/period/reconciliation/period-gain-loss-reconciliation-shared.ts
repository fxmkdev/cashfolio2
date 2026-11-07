import type {
  GainLossReconciliationDiagnostic,
  GainLossReconciliationDiagnosticReason,
  GainLossReconciliationSummary,
} from "../../../shared/gain-loss-reconciliation";
import { moneyAdd, toMoney, type Money } from "../../../shared/money";
import { round2 } from "../period-helpers";

export const VIRTUAL_TRANSFER_CLEARING_ACCOUNT_PREFIX =
  "virtual:transfer-clearing:account:";

function getDiagnosticMessage(
  reason: GainLossReconciliationDiagnosticReason,
): string {
  switch (reason) {
    case "missingInitialRate":
      return "Missing initial valuation rate for opening balance.";
    case "missingConversion":
      return "Missing booking conversion into reference currency.";
    case "invalidExecutionPrice":
      return "Execution price could not be derived from converted values.";
    case "missingPeriodEndRate":
      return "Missing period-end valuation rate for open lots.";
    default: {
      const _exhaustiveCheck: never = reason;
      return _exhaustiveCheck;
    }
  }
}

export function pushDiagnostic(
  diagnostics: GainLossReconciliationDiagnostic[],
  args: {
    reason: GainLossReconciliationDiagnosticReason;
    date: Date;
    bookingId?: string;
    bookingDescription?: string | null;
    transactionId?: string | null;
    transactionDescription?: string | null;
  },
) {
  diagnostics.push({
    reason: args.reason,
    message: getDiagnosticMessage(args.reason),
    bookingId: args.bookingId ?? null,
    bookingDescription: args.bookingDescription ?? null,
    transactionId: args.transactionId ?? null,
    transactionDescription: args.transactionDescription ?? null,
    date: args.date.toISOString(),
  });
}

export function toSummary(args: {
  realizedGainLoss: Money;
  unrealizedGainLoss: Money;
}): GainLossReconciliationSummary<Money> {
  const realizedGainLoss = round2(args.realizedGainLoss);
  const unrealizedGainLoss = round2(args.unrealizedGainLoss);
  return {
    realizedGainLoss,
    unrealizedGainLoss,
    totalGainLoss: round2(moneyAdd(realizedGainLoss, unrealizedGainLoss)),
  };
}

export function toEmptySummary(): GainLossReconciliationSummary<Money> {
  return {
    realizedGainLoss: toMoney(0),
    unrealizedGainLoss: toMoney(0),
    totalGainLoss: toMoney(0),
  };
}

export function toVirtualTransferClearingAccountId(unitKey: string): string {
  return `${VIRTUAL_TRANSFER_CLEARING_ACCOUNT_PREFIX}${unitKey}`;
}
