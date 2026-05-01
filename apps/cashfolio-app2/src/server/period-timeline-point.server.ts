import { normalizePeriodValue } from "../shared/period";
import { startOfUtcDay } from "../shared/date";
import { getOrLoadPeriodBaseData } from "./period-base-data-cache";
import {
  getPeriodEndExclusive,
  resolvePeriodSelection,
} from "./period-selection";
import {
  loadPeriodTimelinePointContext,
  type PeriodTimelinePointContext,
} from "./period-timeline-point-context.server";
import { loadPeriodTimelinePointTotalReturn } from "./period-timeline-point-total-return.server";

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export { loadPeriodTimelinePointContext };
export type { PeriodTimelinePointContext };

export async function loadPeriodTimelinePoint(args: {
  accountBookId: string;
  period?: unknown;
  context?: PeriodTimelinePointContext;
}) {
  const data = {
    accountBookId: args.accountBookId,
    period: normalizePeriodValue(args.period),
  };

  const context =
    args.context ??
    (await loadPeriodTimelinePointContext({
      accountBookId: data.accountBookId,
    }));

  const selection = resolvePeriodSelection({
    periodValue: data.period,
    now: new Date(),
    firstBookingDate: context.accountBookStartDate,
  });
  const isBeforeAccountBookStart = selection.to < context.accountBookStartDate;

  if (isBeforeAccountBookStart) {
    return {
      selectedPeriodValue: selection.periodValue,
      selectedPeriodLabel: selection.label,
      totalReturn: 0,
    };
  }

  const loadedBaseData = await getOrLoadPeriodBaseData({
    accountBookId: data.accountBookId,
    period: data.period,
  });

  const baseData = {
    ...loadedBaseData,
    referenceCurrency: context.referenceCurrency,
    holdingAccountsResolved: context.holdingAccountsResolved,
    selection: {
      ...loadedBaseData.selection,
      periodValue: selection.periodValue,
      label: selection.label,
      periodSpecifier: selection.periodSpecifier,
      granularity: selection.granularity,
      year: selection.year,
      month: selection.month,
      from: selection.from,
      to: selection.to,
      queryEndExclusive: getPeriodEndExclusive(selection.to),
      initialHoldingDate: addUtcDays(selection.from, -1),
      isBeforeAccountBookStart,
      minPeriodDate: context.accountBookStartDate,
      currentDay: startOfUtcDay(new Date()),
    },
  };

  const totalReturn = await loadPeriodTimelinePointTotalReturn({
    accountBookId: data.accountBookId,
    period: data.period,
    baseData,
  });

  return {
    selectedPeriodValue: selection.periodValue,
    selectedPeriodLabel: selection.label,
    totalReturn,
  };
}
