import { Unit } from "@/.prisma-client/enums";
import {
  parseExplicitMonthPeriod,
  parseExplicitYearPeriod,
} from "@/shared/period";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type LedgerSearch = { transactionId?: string; period?: string };

export type LedgerExplicitPeriodSelection = {
  value: string;
  granularity: "month" | "year";
  year: number;
  month: number | null;
  label: string;
};

export function normalizeLedgerPeriodValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  const explicitMonth = parseExplicitMonthPeriod(normalized);
  if (explicitMonth) {
    return explicitMonth.value;
  }

  const explicitYear = parseExplicitYearPeriod(normalized);
  if (explicitYear) {
    return explicitYear.value;
  }

  return undefined;
}

export function parseLedgerExplicitPeriod(
  periodValue: string | undefined,
): LedgerExplicitPeriodSelection | null {
  if (!periodValue) {
    return null;
  }

  const explicitMonth = parseExplicitMonthPeriod(periodValue);
  if (explicitMonth) {
    return {
      value: explicitMonth.value,
      granularity: "month",
      year: explicitMonth.year,
      month: explicitMonth.month,
      label: `${MONTH_NAMES[explicitMonth.month]} ${explicitMonth.year}`,
    };
  }

  const explicitYear = parseExplicitYearPeriod(periodValue);
  if (explicitYear) {
    return {
      value: explicitYear.value,
      granularity: "year",
      year: explicitYear.year,
      month: null,
      label: explicitYear.value,
    };
  }

  return null;
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
export type LedgerBookings = Awaited<
  ReturnType<LedgerServerModule["getLedgerData"]>
>;
export type LedgerAccountOptionSource = Awaited<
  ReturnType<AccountsServerModule["getAccounts"]>
>[number];

export type LedgerRow = {
  id: string;
  transactionId: string;
  bookingValue: number;
  date: string;
  counterpartyAccounts: { id: string; name: string }[];
  description: string;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
};
