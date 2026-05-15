export type TimelineScopedMetric =
  | "income"
  | "expenses"
  | "gainsLosses"
  | "assets"
  | "liabilities";

export type TimelineScopeSelection =
  | "total"
  | `group:${string}`
  | `account:${string}`
  | `unit-type:${string}`
  | `unit:${string}`
  | `unit-account:${string}`
  | `explicit-account:${string}`;

export type TimelineScopeKind = "total" | "group" | "account" | "gainLoss";

export type TimelineScopeOption = {
  value: TimelineScopeSelection;
  label: string;
  kind: TimelineScopeKind;
  treeLabel?: string;
  parentValue?: TimelineScopeSelection;
};

export function isTimelineScopedMetric(
  value: unknown,
): value is TimelineScopedMetric {
  return (
    value === "income" ||
    value === "expenses" ||
    value === "gainsLosses" ||
    value === "assets" ||
    value === "liabilities"
  );
}

export function parseTimelineScopeSelection(
  value: unknown,
): TimelineScopeSelection | undefined {
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

export function isTimelineScopeSelection(
  value: unknown,
): value is TimelineScopeSelection {
  return parseTimelineScopeSelection(value) !== undefined;
}

export function getTimelineScopeKind(
  scope: TimelineScopeSelection,
): TimelineScopeKind {
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
