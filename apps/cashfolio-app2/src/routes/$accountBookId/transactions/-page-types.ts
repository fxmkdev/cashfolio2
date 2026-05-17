import {
  formatExplicitPeriodSelectionLabel,
  formatMonthPeriodValue,
  normalizeExplicitPeriodValue,
  parseExplicitPeriodSelection,
} from "@/shared/period";
import type { UserLocale } from "@/user-locale";

type TransactionsServerModule = typeof import("@/server/transactions-data");
type AccountsServerModule = typeof import("@/server/accounts");

export type TransactionsSearch = { transactionId?: string; period?: string };

export type TransactionsExplicitPeriodSelection = {
  value: string;
  granularity: "month" | "year";
  year: number;
  month: number | null;
  label: string;
};

export function normalizeTransactionsPeriodValue(
  value: unknown,
): string | undefined {
  return normalizeExplicitPeriodValue(value);
}

export function getDefaultTransactionsPeriodValue(
  date: Date = new Date(),
): string {
  return formatMonthPeriodValue(date.getUTCFullYear(), date.getUTCMonth());
}

export function parseTransactionsExplicitPeriod(
  periodValue: string | undefined,
  locale?: UserLocale,
): TransactionsExplicitPeriodSelection | null {
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
    label: formatExplicitPeriodSelectionLabel(explicitPeriodSelection, locale),
  };
}

export function parseTransactionsSearch(
  search: Record<string, unknown>,
): TransactionsSearch {
  return {
    transactionId:
      typeof search.transactionId === "string"
        ? search.transactionId
        : undefined,
    period: normalizeTransactionsPeriodValue(search.period),
  };
}

type TransactionsData = Awaited<
  ReturnType<TransactionsServerModule["getTransactionsData"]>
>;
export type TransactionsRow = TransactionsData["rows"][number];
export type TransactionsAccountOptionSource = Awaited<
  ReturnType<AccountsServerModule["getAccounts"]>
>[number];
