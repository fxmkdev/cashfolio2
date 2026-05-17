export type HistoryScopedMetric =
  | "income"
  | "expenses"
  | "gainsLosses"
  | "assets"
  | "liabilities";

export type HistoryScopeSelection =
  | "total"
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
};

export function isHistoryScopedMetric(
  value: unknown,
): value is HistoryScopedMetric {
  return (
    value === "income" ||
    value === "expenses" ||
    value === "gainsLosses" ||
    value === "assets" ||
    value === "liabilities"
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
