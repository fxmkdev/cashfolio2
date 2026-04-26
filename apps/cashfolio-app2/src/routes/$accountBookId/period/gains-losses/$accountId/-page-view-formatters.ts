import { format } from "date-fns";
import type { EventSide, RealizedEventRow } from "./-page-view-types";

export function buildCurrencyFormatter(currency: string) {
  return new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDescription(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "—";
}

export function toEventSide(event: RealizedEventRow): EventSide {
  if (event.quantity > 0) {
    return "buy";
  }
  if (event.quantity < 0) {
    return "sell";
  }
  return "flat";
}

export function formatDateLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "—";
  }
  return format(date, "dd.MM.yyyy");
}

export function getLedgerActionTooltipLabel(args: {
  canOpenLedger: boolean;
  isVirtualTarget: boolean;
}) {
  if (args.canOpenLedger) {
    return "Open in ledger";
  }
  if (args.isVirtualTarget) {
    return "Virtual accounts have no ledger";
  }
  return "No ledger transaction";
}
