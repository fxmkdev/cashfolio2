import {
  HISTORICAL_DATA_AVAILABLE_AT_UTC_MINUTE,
  HISTORICAL_DATA_DAY_LAG,
} from "./constants";
import { getLatestAssumedAvailableHistoricalUtcDay } from "./date-utils";
import type { ValuationRateSource } from "./types";

export type ValuationLookupContext = {
  latestFetchableDate: Date;
};

function getLatestFetchableHistoricalDate(now = new Date()): Date {
  return getLatestAssumedAvailableHistoricalUtcDay({
    now,
    historicalDataDayLag: HISTORICAL_DATA_DAY_LAG,
    historicalDataAvailableAtUtcMinute: HISTORICAL_DATA_AVAILABLE_AT_UTC_MINUTE,
  });
}

export function combineValuationRateSources(
  sources: ValuationRateSource[],
): ValuationRateSource {
  if (sources.includes("missing")) return "missing";
  if (sources.includes("provider")) return "provider";
  if (sources.includes("fallback")) return "fallback";
  if (sources.includes("timeSeries")) return "timeSeries";
  return "identity";
}

export function createValuationLookupContext(
  now = new Date(),
): ValuationLookupContext {
  return {
    latestFetchableDate: getLatestFetchableHistoricalDate(now),
  };
}
