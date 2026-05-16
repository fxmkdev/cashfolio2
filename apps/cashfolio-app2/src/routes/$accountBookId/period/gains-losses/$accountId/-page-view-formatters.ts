import { formatUtcDateForLocale } from "@/shared/date";
import {
  createDisplayNumberFormatter,
  getCurrencyDecimals,
} from "@/shared/unit-format";
import { DEFAULT_USER_LOCALE } from "@/user-locale";
export { getGridUserLocale } from "@/components/grid-locale";
import type { EventSide, RealizedEventRow } from "./-page-view-types";

export function buildCurrencyFormatter(currency: string, locale: string) {
  return createDisplayNumberFormatter({
    locale,
    style: "currency",
    currency,
    decimals: getCurrencyDecimals(currency),
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

export function formatDateLabel(value: string, locale = DEFAULT_USER_LOCALE) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "—";
  }
  return formatUtcDateForLocale(date, locale);
}

export function getLedgerActionTooltipLabel(args: {
  canOpenLedger: boolean;
  isVirtualTarget: boolean;
}) {
  if (args.canOpenLedger) {
    return "Open in Ledger";
  }
  if (args.isVirtualTarget) {
    return "Virtual accounts have no ledger";
  }
  return "No ledger transaction";
}
