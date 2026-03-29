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

export const DEFAULT_PERIOD_VALUE: PeriodPresetValue = PERIOD_PRESET_LAST_MONTH;

export type ExplicitMonthPeriod = {
  year: number;
  month: number; // 0-based
  value: string;
};

export type ExplicitYearPeriod = {
  year: number;
  value: string;
};

export function formatMonthPeriodValue(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}`;
}

export function parseExplicitMonthPeriod(
  value: string,
): ExplicitMonthPeriod | null {
  const match = PERIOD_MONTH_REGEX.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const monthOneBased = Number(match[2]);
  if (monthOneBased < 1 || monthOneBased > 12) {
    return null;
  }

  const month = monthOneBased - 1;
  return {
    year,
    month,
    value: formatMonthPeriodValue(year, month),
  };
}

export function parseExplicitYearPeriod(
  value: string,
): ExplicitYearPeriod | null {
  const match = PERIOD_YEAR_REGEX.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 100) return null;
  return {
    year,
    value: String(year).padStart(4, "0"),
  };
}

export function isSupportedPeriodValue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();

  if ((PERIOD_PRESET_VALUES as readonly string[]).includes(normalized)) {
    return true;
  }

  return (
    parseExplicitMonthPeriod(normalized) != null ||
    parseExplicitYearPeriod(normalized) != null
  );
}

export function normalizePeriodValue(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_PERIOD_VALUE;
  }

  const normalized = value.trim().toLowerCase();

  if ((PERIOD_PRESET_VALUES as readonly string[]).includes(normalized)) {
    return normalized;
  }

  const explicitMonth = parseExplicitMonthPeriod(normalized);
  if (explicitMonth) {
    return explicitMonth.value;
  }

  const explicitYear = parseExplicitYearPeriod(normalized);
  if (explicitYear) {
    return explicitYear.value;
  }

  return DEFAULT_PERIOD_VALUE;
}
