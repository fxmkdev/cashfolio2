import {
  DEFAULT_PERIOD_VALUE,
  isSupportedPeriodValue,
  normalizePeriodValue,
} from "@/shared/period";

export {
  DEFAULT_PERIOD_VALUE,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_VALUES,
  PERIOD_PRESET_YTD,
  type PeriodPresetValue,
} from "@/shared/period";

export type PeriodSearch = {
  period?: string;
  expensePath?: string;
  incomePath?: string;
};

export function isPeriodSearchValue(value: unknown): value is string {
  return isSupportedPeriodValue(value);
}

function normalizeBreakdownPathSearchValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const segments = value
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return undefined;
  }

  return segments.join(",");
}

export function parsePeriodSearch(
  search: Record<string, unknown>,
): PeriodSearch {
  return {
    period: isPeriodSearchValue(search.period)
      ? normalizePeriodValue(search.period)
      : undefined,
    expensePath: normalizeBreakdownPathSearchValue(search.expensePath),
    incomePath: normalizeBreakdownPathSearchValue(search.incomePath),
  };
}

export function getPeriodValue(search: PeriodSearch): string {
  return search.period ?? DEFAULT_PERIOD_VALUE;
}

export function parseBreakdownPathSearchValue(
  pathValue: string | undefined,
): string[] {
  if (!pathValue) {
    return [];
  }

  return pathValue.split(",").filter((segment) => segment.length > 0);
}

export function formatBreakdownPathSearchValue(
  path: string[],
): string | undefined {
  if (path.length === 0) {
    return undefined;
  }

  return path.join(",");
}

export function getBreakdownPathByType(search: PeriodSearch): {
  expense: string[];
  income: string[];
} {
  return {
    expense: parseBreakdownPathSearchValue(search.expensePath),
    income: parseBreakdownPathSearchValue(search.incomePath),
  };
}
