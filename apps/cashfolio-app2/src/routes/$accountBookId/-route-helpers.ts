import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import { type AccountsMode, type TabValue } from "./accounts/-page-types";

export type AccountBookSection =
  | "transactions"
  | "accounts"
  | "report"
  | "settings"
  | "history"
  | "user-settings";

export type AccountsLinkSearch = {
  tab: TabValue;
  mode: AccountsMode;
};

export const DESKTOP_RAIL_COLLAPSED_STORAGE_KEY =
  "cashfolio:accountBookShell:desktopRailCollapsed";

const DEFAULT_ACCOUNTS_LINK_SEARCH: AccountsLinkSearch = {
  tab: "BALANCE",
  mode: "active",
};

type RouterMatchSnapshot = {
  routeId: string;
  account: unknown;
};

export function parseDesktopRailCollapsedPreference(
  storedValue: string | null,
): boolean {
  return storedValue === "true";
}

export function getActiveSection(args: {
  pathname: string;
  accountBookId: string;
}): AccountBookSection {
  const segments = args.pathname.split("/").filter(Boolean);
  if (segments[0] !== args.accountBookId) {
    return "accounts";
  }

  const section = segments[1];
  if (section === "transactions") return "transactions";
  if (section === "report") return "report";
  if (section === "settings") return "settings";
  if (section === "user-settings") return "user-settings";
  if (section === "history") return "history";
  return "accounts";
}

export function getPeriodLinkSearch(search: Record<string, unknown>): {
  period?: string;
} {
  return typeof search.period === "string" ? { period: search.period } : {};
}

function isLedgerAccount(value: unknown): value is {
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
  isActive: boolean;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as {
    type?: unknown;
    equityAccountSubtype?: unknown;
    isActive?: unknown;
  };

  const hasValidType =
    candidate.type === AccountType.ASSET ||
    candidate.type === AccountType.LIABILITY ||
    candidate.type === AccountType.EQUITY;
  const hasValidEquitySubtype =
    candidate.equityAccountSubtype === null ||
    candidate.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS ||
    candidate.equityAccountSubtype === EquityAccountSubtype.OPENING_BALANCES ||
    candidate.equityAccountSubtype === EquityAccountSubtype.INCOME ||
    candidate.equityAccountSubtype === EquityAccountSubtype.EXPENSE;

  return (
    hasValidType &&
    hasValidEquitySubtype &&
    typeof candidate.isActive === "boolean"
  );
}

export function hasLedgerAccountLoaderData(value: unknown): value is {
  account: {
    type: AccountType;
    equityAccountSubtype: EquityAccountSubtype | null;
    isActive: boolean;
  };
} {
  if (typeof value !== "object" || value === null || !("account" in value)) {
    return false;
  }

  const account = (value as { account: unknown }).account;
  return isLedgerAccount(account);
}

export function getAccountsLinkSearch(_args: {
  locationSearch: Record<string, unknown>;
  matches: readonly RouterMatchSnapshot[];
}): AccountsLinkSearch {
  return DEFAULT_ACCOUNTS_LINK_SEARCH;
}
