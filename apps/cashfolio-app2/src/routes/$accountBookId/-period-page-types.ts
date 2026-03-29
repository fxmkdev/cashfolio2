import {
  DEFAULT_PERIOD_VALUE,
  isSupportedPeriodValue,
  normalizePeriodValue,
} from "../../shared/period";

export {
  DEFAULT_PERIOD_VALUE,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_VALUES,
  PERIOD_PRESET_YTD,
  type PeriodPresetValue,
} from "../../shared/period";

export type PeriodSearch = {
  period?: string;
};

export function isPeriodSearchValue(value: unknown): value is string {
  return isSupportedPeriodValue(value);
}

export function parsePeriodSearch(
  search: Record<string, unknown>,
): PeriodSearch {
  return {
    period: isPeriodSearchValue(search.period)
      ? normalizePeriodValue(search.period)
      : undefined,
  };
}

export function getPeriodValue(search: PeriodSearch): string {
  return search.period ?? DEFAULT_PERIOD_VALUE;
}
