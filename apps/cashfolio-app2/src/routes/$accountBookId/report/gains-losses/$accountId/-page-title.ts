import type { PeriodGainLossReconciliation } from "@/server/period-gain-loss-reconciliation";

export function getGainLossReconciliationPageTitle(
  reconciliation: PeriodGainLossReconciliation | null | undefined,
): string {
  return reconciliation
    ? `${reconciliation.target.accountName} · ${reconciliation.target.unitLabel}`
    : "Gain/Loss Reconciliation";
}
