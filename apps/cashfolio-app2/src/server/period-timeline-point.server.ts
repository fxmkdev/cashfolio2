import { normalizePeriodValue } from "../shared/period";
import { getOrLoadPeriodBaseData } from "./period-base-data-cache";
import { resolvePeriodSelection } from "./period-selection";
import {
  loadPeriodTimelinePointContext,
  type PeriodTimelinePointContext,
} from "./period-timeline-point-context.server";
import { loadPeriodTimelinePointTotalReturn } from "./period-timeline-point-total-return.server";

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

  const totalReturn = await loadPeriodTimelinePointTotalReturn({
    accountBookId: data.accountBookId,
    period: data.period,
    baseData: loadedBaseData,
  });

  return {
    selectedPeriodValue: selection.periodValue,
    selectedPeriodLabel: selection.label,
    totalReturn,
  };
}
