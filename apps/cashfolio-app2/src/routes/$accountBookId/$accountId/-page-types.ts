import {
  formatExplicitPeriodSelectionLabel,
  normalizeExplicitPeriodValue,
  parseExplicitPeriodSelection,
} from "@/shared/period";

export type LedgerSearch = { transactionId?: string; period?: string };

export type LedgerExplicitPeriodSelection = {
  value: string;
  granularity: "month" | "year";
  year: number;
  month: number | null;
  label: string;
};

export function normalizeLedgerPeriodValue(value: unknown): string | undefined {
  return normalizeExplicitPeriodValue(value);
}

export function parseLedgerExplicitPeriod(
  periodValue: string | undefined,
): LedgerExplicitPeriodSelection | null {
  if (!periodValue) {
    return null;
  }

  const explicitPeriodSelection = parseExplicitPeriodSelection(periodValue);
  if (!explicitPeriodSelection) {
    return null;
  }

  return {
    value: explicitPeriodSelection.value,
    granularity: explicitPeriodSelection.granularity,
    year: explicitPeriodSelection.year,
    month: explicitPeriodSelection.month,
    label: formatExplicitPeriodSelectionLabel(explicitPeriodSelection),
  };
}

export function parseLedgerSearch(
  search: Record<string, unknown>,
): LedgerSearch {
  return {
    transactionId:
      typeof search.transactionId === "string"
        ? search.transactionId
        : undefined,
    period: normalizeLedgerPeriodValue(search.period),
  };
}

type AccountsServerModule = typeof import("@/server/accounts");
type LedgerServerModule = typeof import("@/server/ledger");

export type LedgerAccount = Awaited<
  ReturnType<LedgerServerModule["getAccountForLedger"]>
>;
type LedgerData = Awaited<ReturnType<LedgerServerModule["getLedgerData"]>>;
export type LedgerRows = LedgerData["rows"];
export type LedgerAccountOptionSource = Awaited<
  ReturnType<AccountsServerModule["getAccounts"]>
>[number];

export type LedgerRow = LedgerRows[number];
