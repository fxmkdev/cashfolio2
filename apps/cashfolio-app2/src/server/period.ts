import { toNumericMoney } from "./money-boundary";
import { createServerFn } from "@tanstack/react-start";
import {
  DEFAULT_PERIOD_VALUE,
  isSupportedPeriodValue,
  normalizePeriodValue,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_VALUES,
  PERIOD_PRESET_YTD,
  type PeriodPresetValue,
} from "../shared/period";
import {
  buildBreakdownHierarchy as buildBreakdownHierarchyDecimal,
  buildBreakdownItems as buildBreakdownItemsDecimal,
  computeHoldingGainLossForEventSeries as computeHoldingGainLossForEventSeriesDecimal,
  createBreakdownBucket,
  isMultiUnitTransaction,
  shouldIncludeTransactionForPeriod,
} from "./period/period-helpers";
import {
  getPeriodEndExclusive,
  resolvePeriodSelection,
  type PeriodSpecifier,
} from "./period/period-selection";
import { computeEndOfPeriodBalanceStats as computeEndOfPeriodBalanceStatsDecimal } from "./period/period-balance-stats";
import { normalizeUserLocaleInput } from "../user-locale";

export {
  DEFAULT_PERIOD_VALUE,
  isSupportedPeriodValue,
  normalizePeriodValue,
  PERIOD_PRESET_LAST_MONTH,
  PERIOD_PRESET_LAST_YEAR,
  PERIOD_PRESET_MTD,
  PERIOD_PRESET_VALUES,
  PERIOD_PRESET_YTD,
};
export type { PeriodPresetValue };
export type { PeriodSpecifier };
export {
  getPeriodEndExclusive,
  createBreakdownBucket,
  isMultiUnitTransaction,
  resolvePeriodSelection,
  shouldIncludeTransactionForPeriod,
};

export const getPeriodOverview = createServerFn({
  method: "GET",
})
  .inputValidator(
    (data: { accountBookId: string; period?: unknown; locale?: unknown }) => ({
      accountBookId: data.accountBookId,
      period: normalizePeriodValue(data.period),
      locale: normalizeUserLocaleInput(data.locale),
    }),
  )
  .handler(async ({ data }) => {
    const { ensureAuthorizedForAccountBookId } =
      await import("../account-books/functions.server");
    const { loadPeriodOverview } =
      await import("./period/period-overview.server");

    await ensureAuthorizedForAccountBookId(data.accountBookId);
    return loadPeriodOverview(data);
  });

export function buildBreakdownHierarchy(
  args: Parameters<typeof buildBreakdownHierarchyDecimal>[0],
) {
  return toNumericMoney(buildBreakdownHierarchyDecimal(args));
}

export function buildBreakdownItems(
  args: Parameters<typeof buildBreakdownItemsDecimal>[0],
) {
  return toNumericMoney(buildBreakdownItemsDecimal(args));
}

export async function computeEndOfPeriodBalanceStats(
  args: Parameters<typeof computeEndOfPeriodBalanceStatsDecimal>[0],
) {
  return toNumericMoney(await computeEndOfPeriodBalanceStatsDecimal(args));
}

export function computeHoldingGainLossForEventSeries(
  args: Parameters<typeof computeHoldingGainLossForEventSeriesDecimal>[0],
) {
  return toNumericMoney(computeHoldingGainLossForEventSeriesDecimal(args));
}
