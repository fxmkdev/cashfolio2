import { Unit } from "../.prisma-client/enums";
import type { ReportingGrouping } from "./reporting-grouping";

export type HistoryScopedMetric =
  "cashFlow" | "income" | "expenses" | "gainsLosses" | "netWorth";

export type HistoryScopeSelection =
  | "total"
  | `asset-class:${string}`
  | `gain-loss-account:${string}`
  | `gain-loss-investment:${string}`
  | `group:${string}`
  | `account:${string}`
  | `unit-type:${string}`
  | `unit:${string}`
  | `unit-account:${string}`
  | `explicit-account:${string}`;

export type HistoryScopeKind = "total" | "group" | "account" | "gainLoss";

export type HistoryScopeOption = {
  value: HistoryScopeSelection;
  label: string;
  kind: HistoryScopeKind;
  treeLabel?: string;
  parentValue?: HistoryScopeSelection;
  accountId?: string;
  legacyValues?: string[];
  grouping?: ReportingGrouping;
};

export function isHistoryScopedMetric(
  value: unknown,
): value is HistoryScopedMetric {
  return (
    value === "cashFlow" ||
    value === "income" ||
    value === "expenses" ||
    value === "gainsLosses" ||
    value === "netWorth"
  );
}

export function parseHistoryScopeSelection(
  value: unknown,
): HistoryScopeSelection | undefined {
  if (value === "total") {
    return "total";
  }

  if (typeof value !== "string") {
    return undefined;
  }

  for (const prefix of [
    "asset-class:",
    "gain-loss-account:",
    "gain-loss-investment:",
  ] as const) {
    if (value.startsWith(prefix)) {
      const id = value.slice(prefix.length).trim();
      return id ? `${prefix}${id}` : undefined;
    }
  }

  if (value.startsWith("group:")) {
    const groupId = value.slice("group:".length).trim();
    return groupId.length > 0 ? (`group:${groupId}` as const) : undefined;
  }

  if (value.startsWith("account:")) {
    const accountId = value.slice("account:".length).trim();
    return accountId.length > 0 ? (`account:${accountId}` as const) : undefined;
  }

  if (value.startsWith("unit-type:")) {
    const unitTypeId = value.slice("unit-type:".length).trim();
    return unitTypeId.length > 0
      ? (`unit-type:${unitTypeId}` as const)
      : undefined;
  }

  if (value.startsWith("unit:")) {
    const unitId = value.slice("unit:".length).trim();
    return unitId.length > 0 ? (`unit:${unitId}` as const) : undefined;
  }

  if (value.startsWith("unit-account:")) {
    const unitAccountId = value.slice("unit-account:".length).trim();
    return unitAccountId.length > 0
      ? (`unit-account:${unitAccountId}` as const)
      : undefined;
  }

  if (value.startsWith("explicit-account:")) {
    const explicitAccountId = value.slice("explicit-account:".length).trim();
    return explicitAccountId.length > 0
      ? (`explicit-account:${explicitAccountId}` as const)
      : undefined;
  }

  return undefined;
}

export function isHistoryScopeSelection(
  value: unknown,
): value is HistoryScopeSelection {
  return parseHistoryScopeSelection(value) !== undefined;
}

export function getHistoryScopeKind(
  scope: HistoryScopeSelection,
): HistoryScopeKind {
  if (scope === "total") {
    return "total";
  }

  if (scope.startsWith("group:")) {
    return "group";
  }

  if (scope.startsWith("account:")) {
    return "account";
  }

  return "gainLoss";
}

/** Legacy leaf identities name an account; valuation categories cannot name a class. */
export function normalizeGainLossScope(
  scope: HistoryScopeSelection,
  options: HistoryScopeOption[],
): HistoryScopeSelection {
  if (
    scope.startsWith("explicit-account:") ||
    scope.startsWith("unit-account:")
  ) {
    const matched = options.find((option) =>
      option.legacyValues?.includes(scope),
    );
    if (matched) return matched.value;
    for (const id of [
      "explicit-unattributed:missing-counterpart",
      "explicit-unattributed:multiple-counterparts",
    ]) {
      if (scope === `explicit-account:${id}`) return `gain-loss-account:${id}`;
    }
    // Virtual IDs embed their complete unit identity. Reconstruct the entire old
    // leaf rather than taking an ambiguous account-ID suffix from a real leaf.
    const virtualPrefix = "virtual:transfer-clearing:account:";
    const index = scope.indexOf(`:${virtualPrefix}`);
    if (index !== -1) {
      const accountId = scope.slice(index + 1);
      const unitKey = accountId.slice(virtualPrefix.length);
      const legacyUnit = unitKey.startsWith("currency:")
        ? `fx:${unitKey.slice("currency:".length)}`
        : unitKey;
      if (scope === `unit-account:${legacyUnit}:${accountId}`)
        return `gain-loss-account:${accountId}`;
    }
    return "total";
  }
  return scope === "total" ||
    scope.startsWith("asset-class:") ||
    scope.startsWith("gain-loss-investment:") ||
    scope.startsWith("gain-loss-account:") ||
    scope.startsWith("group:") ||
    scope.startsWith("account:")
    ? scope
    : "total";
}

/** Preserve the full historic leaf identity, including colon-containing account IDs. */
export function getLegacyHoldingGainLossScope(account: {
  id: string;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
}): string {
  const code = (value: string | null) =>
    value?.trim().toUpperCase() || "UNKNOWN";
  let unitId: string;
  if (account.unit === Unit.CURRENCY) unitId = `fx:${code(account.currency)}`;
  else if (account.unit === Unit.CRYPTOCURRENCY)
    unitId = `crypto:${code(account.cryptocurrency)}`;
  else
    unitId = `security:${code(account.symbol)}:${code(account.tradeCurrency)}`;
  return `unit-account:${unitId}:${account.id}`;
}
