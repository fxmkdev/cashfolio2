export type TimelineScopedMetric =
  | "income"
  | "expenses"
  | "assets"
  | "liabilities";

export type TimelineScopeSelection =
  | "total"
  | `group:${string}`
  | `account:${string}`;

export type TimelineScopeKind = "total" | "group" | "account";

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

  return "account";
}
