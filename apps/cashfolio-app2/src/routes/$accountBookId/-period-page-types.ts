const PERIOD_MONTH_REGEX = /^(\d{4})-(\d{2})$/;
const PERIOD_YEAR_REGEX = /^(\d{4})$/;

export const PERIOD_PRESET_MTD = "mtd";
export const PERIOD_PRESET_YTD = "ytd";
export const PERIOD_PRESET_LAST_MONTH = "last-month";
export const PERIOD_PRESET_LAST_YEAR = "last-year";

export const PERIOD_PRESET_VALUES = [
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_YTD,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
] as const;

export type PeriodPresetValue = (typeof PERIOD_PRESET_VALUES)[number];
export type PeriodSearch = {
  period?: string;
};

export const DEFAULT_PERIOD_VALUE: PeriodPresetValue = PERIOD_PRESET_LAST_MONTH;

function isExplicitMonthPeriodValue(value: string): boolean {
  const match = PERIOD_MONTH_REGEX.exec(value);
  if (!match) return false;

  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

function isExplicitYearPeriodValue(value: string): boolean {
  return PERIOD_YEAR_REGEX.test(value);
}

export function isPeriodSearchValue(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const normalized = value.trim().toLowerCase();

  if ((PERIOD_PRESET_VALUES as readonly string[]).includes(normalized)) {
    return true;
  }

  return (
    isExplicitMonthPeriodValue(normalized) ||
    isExplicitYearPeriodValue(normalized)
  );
}

export function parsePeriodSearch(
  search: Record<string, unknown>,
): PeriodSearch {
  return {
    period: isPeriodSearchValue(search.period)
      ? search.period.trim().toLowerCase()
      : undefined,
  };
}

export function getPeriodValue(search: PeriodSearch): string {
  return search.period ?? DEFAULT_PERIOD_VALUE;
}
