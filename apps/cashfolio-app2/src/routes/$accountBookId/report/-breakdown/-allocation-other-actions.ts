import type { PeriodBreakdownChartDatum } from "./-breakdown-chart-options";
import { parseBreakdownAccountId } from "./-breakdown-drill";

export function isAllocationActionKey(
  event: Pick<
    KeyboardEvent,
    "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
  >,
) {
  return (
    (event.key === "Enter" || event.key === " ") &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export function getAllocationOtherAction(
  datum: Pick<PeriodBreakdownChartDatum, "id" | "kind" | "isDrillable">,
): "Drill Down" | "Open Ledger" | null {
  if (datum.kind === "group") return datum.isDrillable ? "Drill Down" : null;
  if (datum.kind !== "account") return null;
  const accountId = parseBreakdownAccountId(datum.id);
  // Transfer-clearing balances contribute to allocation but have no ledger.
  return accountId && !accountId.startsWith("virtual:") ? "Open Ledger" : null;
}
