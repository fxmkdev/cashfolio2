import type { PeriodGainLossReconciliation } from "@/shared/reporting/gain-loss-reconciliation";

export function getGainLossReconciliationPageTitle(
  reconciliation: PeriodGainLossReconciliation | null | undefined,
): string {
  return reconciliation
    ? `${reconciliation.target.accountName} · ${reconciliation.target.unitLabel}`
    : "Gain/Loss Reconciliation";
}
