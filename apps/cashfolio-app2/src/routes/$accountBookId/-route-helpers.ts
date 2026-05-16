import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import {
  parseAccountsSearch,
  tabs,
  type AccountsMode,
  type TabValue,
} from "./accounts/-page-types";

export type AccountBookSection =
  | "activity"
  | "accounts"
  | "period"
  | "settings"
  | "timeline"
  | "valuation-cache";

export type AccountsLinkSearch = {
  tab: TabValue;
  mode: AccountsMode;
};

export const DESKTOP_RAIL_COLLAPSED_STORAGE_KEY =
  "cashfolio:accountBookShell:desktopRailCollapsed";

const DEFAULT_ACCOUNTS_LINK_SEARCH: AccountsLinkSearch = {
  tab: "ASSET",
  mode: "active",
};

const LEDGER_ROUTE_IDS = new Set([
  "/$accountBookId/$accountId",
  "/$accountBookId/$accountId/",
  "/$accountId",
]);

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
  if (section === "activity") return "activity";
  if (section === "period") return "period";
  if (section === "settings") return "settings";
  if (section === "timeline") return "timeline";
  if (section === "valuation-cache") return "valuation-cache";
  return "accounts";
}

function parseAccountsTab(value: unknown): TabValue | null {
  return typeof value === "string" && tabs.some((tab) => tab.value === value)
    ? (value as TabValue)
    : null;
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

function getAccountsTabFromLedgerAccount(account: {
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
}): TabValue {
  if (account.type === AccountType.ASSET) {
    return "ASSET";
  }
  if (account.type === AccountType.LIABILITY) {
    return "LIABILITY";
  }
  if (account.equityAccountSubtype === EquityAccountSubtype.INCOME) {
    return "EQUITY-INCOME";
  }
  if (account.equityAccountSubtype === EquityAccountSubtype.EXPENSE) {
    return "EQUITY-EXPENSE";
  }
  return "ASSET";
}

export function getAccountsLinkSearch(args: {
  locationSearch: Record<string, unknown>;
  matches: readonly RouterMatchSnapshot[];
}): AccountsLinkSearch {
  const tabFromSearch = parseAccountsTab(args.locationSearch.tab);
  if (tabFromSearch) {
    return parseAccountsSearch({
      tab: tabFromSearch,
      mode: args.locationSearch.mode,
    });
  }

  for (let index = args.matches.length - 1; index >= 0; index -= 1) {
    const match = args.matches[index];
    if (!LEDGER_ROUTE_IDS.has(match.routeId)) {
      continue;
    }

    if (!isLedgerAccount(match.account)) {
      continue;
    }

    return {
      tab: getAccountsTabFromLedgerAccount(match.account),
      mode: match.account.isActive ? "active" : "archived",
    };
  }

  return DEFAULT_ACCOUNTS_LINK_SEARCH;
}
