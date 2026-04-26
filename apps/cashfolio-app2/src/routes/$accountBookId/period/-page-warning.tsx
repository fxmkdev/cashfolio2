import { Alert } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";

export function getSkippedValuationWarning(
  skippedBookingsCount: number,
): string | null {
  if (skippedBookingsCount <= 0) {
    return null;
  }

  return `${skippedBookingsCount} valuation-related item(s) were skipped because valuation data was unavailable. Strict total-return reconciliation versus net-worth deltas may be incomplete for this period.`;
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
