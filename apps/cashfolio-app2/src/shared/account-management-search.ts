import {
  getManagementTabs,
  tabs,
  type AccountsMode,
  type TabValue,
} from "./account-tabs";
import {
  isReportingGrouping,
  type ReportingGrouping,
} from "./reporting-grouping";

export function parseCategoriesSearch(search: Record<string, unknown>) {
  return {
    tab: getManagementTabs("categories").some((tab) => tab.value === search.tab)
      ? (search.tab as TabValue)
      : ("EQUITY-INCOME" as const),
    showArchived:
      typeof search.showArchived === "boolean"
        ? search.showArchived
        : search.mode === "archived",
  };
}

export function getCategoriesRedirect(search: Record<string, unknown>) {
  return {
    to: "/$accountBookId/settings/categories" as const,
    search: parseCategoriesSearch(search),
    replace: true as const,
  };
}

function isTabValue(value: unknown): value is TabValue {
  return typeof value === "string" && tabs.some((tab) => tab.value === value);
}

export function parseAccountsSearch(search: Record<string, unknown>): {
  tab: TabValue;
  mode: AccountsMode;
  showArchived?: boolean;
  grouping?: ReportingGrouping;
  organize?: true;
} {
  const tab = isTabValue(search.tab) ? search.tab : "BALANCE";
  return {
    tab,
    ...(tab === "BALANCE" &&
    search.grouping !== "assetClass" &&
    search.organize === true
      ? { organize: true as const }
      : {}),
    ...(isReportingGrouping(search.grouping)
      ? { grouping: search.grouping }
      : {}),
    ...(tab.startsWith("EQUITY-") && typeof search.showArchived === "boolean"
      ? { showArchived: search.showArchived }
      : {}),
    mode:
      tab.startsWith("EQUITY-") && search.mode === "archived"
        ? "archived"
        : "active",
  };
}

/** Normalize legacy Accounts URLs without losing a valid organizer request. */
export function getCanonicalAccountsSearch(
  searchStr: string,
  search: ReturnType<typeof parseAccountsSearch>,
) {
  const raw = new URLSearchParams(searchStr);
  if (
    raw.get("mode") !== "archived" &&
    raw.get("tab") === "BALANCE" &&
    !(raw.has("organize") && !search.organize)
  )
    return undefined;
  return {
    tab: "BALANCE" as const,
    mode: "active" as const,
    ...(search.grouping ? { grouping: search.grouping } : {}),
    ...(search.organize ? { organize: true as const } : {}),
  };
}
