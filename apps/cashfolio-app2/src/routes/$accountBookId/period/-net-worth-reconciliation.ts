import { formatMonthPeriodValue } from "@/shared/period";
import {
  moneyAdd,
  moneyIsZero,
  moneyRound2,
  moneySubtract,
  toMoneyNumber,
} from "@/shared/money";

export type NetWorthReconciliationModel = {
  hasMismatch: boolean;
  baselineSource: "previous-period" | "opening-balance";
  baselineNetWorth: number;
  expectedNetWorth: number;
  currentNetWorth: number;
  difference: number;
};

function roundToCents(value: number): number {
  return toMoneyNumber(moneyRound2(value));
}

export function buildNetWorthReconciliationModel(args: {
  baselineNetWorth: number;
  baselineSource: "previous-period" | "opening-balance";
  currentNetWorth: number;
  totalReturn: number;
}): NetWorthReconciliationModel {
  const baselineNetWorth = roundToCents(args.baselineNetWorth);
  const expectedNetWorth = roundToCents(
    toMoneyNumber(moneyAdd(baselineNetWorth, args.totalReturn)),
  );
  const currentNetWorth = roundToCents(args.currentNetWorth);
  const difference = roundToCents(
    toMoneyNumber(moneySubtract(currentNetWorth, expectedNetWorth)),
  );

  return {
    hasMismatch: !moneyIsZero(difference),
    baselineSource: args.baselineSource,
    baselineNetWorth,
    expectedNetWorth,
    currentNetWorth,
    difference,
  };
}

export function getPreviousPeriodValue(args: {
  selectedGranularity: "month" | "year";
  selectedYear: number;
  selectedMonth: number | null;
  minBookingDate: Date;
}): string | null {
  const minYear = args.minBookingDate.getUTCFullYear();

  if (args.selectedGranularity === "year") {
    if (args.selectedYear <= minYear) {
      return null;
    }

    return String(args.selectedYear - 1).padStart(4, "0");
  }

  const selectedMonth = args.selectedMonth ?? 0;
  const selectedMonthIndex = args.selectedYear * 12 + selectedMonth;
  const minMonthIndex =
    args.minBookingDate.getUTCFullYear() * 12 +
    args.minBookingDate.getUTCMonth();

  if (selectedMonthIndex <= minMonthIndex) {
    return null;
  }

  const previousMonthIndex = selectedMonthIndex - 1;
  const previousYear = Math.floor(previousMonthIndex / 12);
  const previousMonth = previousMonthIndex % 12;
  return formatMonthPeriodValue(previousYear, previousMonth);
}
