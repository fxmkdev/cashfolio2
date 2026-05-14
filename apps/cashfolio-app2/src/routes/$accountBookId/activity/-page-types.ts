import {
  formatExplicitPeriodSelectionLabel,
  normalizeExplicitPeriodValue,
  parseExplicitPeriodSelection,
} from "@/shared/period";

type ActivityServerModule = typeof import("@/server/activity");
type AccountsServerModule = typeof import("@/server/accounts");

export type ActivitySearch = { transactionId?: string; period?: string };

export type ActivityExplicitPeriodSelection = {
  value: string;
  granularity: "month" | "year";
  year: number;
  month: number | null;
  label: string;
};

export function normalizeActivityPeriodValue(
  value: unknown,
): string | undefined {
  return normalizeExplicitPeriodValue(value);
}

export function parseActivityExplicitPeriod(
  periodValue: string | undefined,
): ActivityExplicitPeriodSelection | null {
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

export function parseActivitySearch(
  search: Record<string, unknown>,
): ActivitySearch {
  return {
    transactionId:
      typeof search.transactionId === "string"
        ? search.transactionId
        : undefined,
    period: normalizeActivityPeriodValue(search.period),
  };
}

type ActivityData = Awaited<
  ReturnType<ActivityServerModule["getActivityData"]>
>;
export type ActivityRow = ActivityData["rows"][number];
export type ActivityAccountOptionSource = Awaited<
  ReturnType<AccountsServerModule["getAccounts"]>
>[number];
