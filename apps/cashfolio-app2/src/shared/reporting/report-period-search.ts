import {
  DEFAULT_PERIOD_VALUE,
  isSupportedPeriodValue,
  normalizePeriodValue,
} from "./period";

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
