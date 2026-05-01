import { normalizePeriodValue } from "../shared/period";
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
  const queryStart = selection.from;
  const queryEndExclusive = getPeriodEndExclusive(selection.to);
  const initialHoldingDate = addUtcDays(queryStart, -1);

  const totalReturn = await loadPeriodTimelinePointTotalReturn({
    accountBookId: data.accountBookId,
    queryStart,
    queryEndExclusive,
    periodEnd: selection.to,
    initialHoldingDate,
    context,
    isBeforeAccountBookStart,
  });

  return {
    selectedPeriodValue: selection.periodValue,
    selectedPeriodLabel: selection.label,
    totalReturn,
  };
}
