import { Alert } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { NetWorthReconciliationModel } from "./-net-worth-reconciliation";

export function getSkippedValuationWarning(
  skippedBookingsCount: number,
): string | null {
  if (skippedBookingsCount <= 0) {
    return null;
  }

  return `${skippedBookingsCount} valuation-related item(s) were skipped because valuation data was unavailable. Strict total-return reconciliation versus net-worth deltas may be incomplete for this period.`;
}

export function getNetWorthReconciliationWarning(args: {
  reconciliation: NetWorthReconciliationModel | null;
  currencyFormatter: Intl.NumberFormat;
}): string | null {
  if (!args.reconciliation?.hasMismatch) {
    return null;
  }

  const baselineLabel =
    args.reconciliation.baselineSource === "previous-period"
      ? "previous period net worth"
      : "opening-balance net worth";

  return `End-of-period net worth (${args.currencyFormatter.format(args.reconciliation.currentNetWorth)}) does not match ${baselineLabel} plus this period's total return (${args.currencyFormatter.format(args.reconciliation.expectedNetWorth)}). Difference: ${args.currencyFormatter.format(args.reconciliation.difference)}.`;
}

export function PeriodNetWorthReconciliationWarning(args: {
  reconciliation: NetWorthReconciliationModel | null;
  currencyFormatter: Intl.NumberFormat;
}) {
  const warning = getNetWorthReconciliationWarning({
    reconciliation: args.reconciliation,
    currencyFormatter: args.currencyFormatter,
  });
  if (!warning) {
    return null;
  }

  return (
    <Alert
      variant="light"
      color="yellow"
      icon={<IconAlertTriangle size={16} />}
      title="Net worth reconciliation mismatch"
      data-testid="period-net-worth-reconciliation-warning"
    >
      {warning}
    </Alert>
  );
}

export function PeriodSkippedValuationWarning(args: {
  skippedBookingsCount: number;
}) {
  const warning = getSkippedValuationWarning(args.skippedBookingsCount);
  if (!warning) {
    return null;
  }

  return (
    <Alert
      variant="light"
      color="yellow"
      icon={<IconAlertTriangle size={16} />}
      title="Partial data"
      data-testid="period-skipped-valuations-warning"
    >
      {warning}
    </Alert>
  );
}
