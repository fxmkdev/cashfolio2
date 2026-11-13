import { Temporal } from "../temporal";
import {
  accountReturnExplanation,
  type AccountReturnBasis,
  type AccountReturnMetric,
  type AccountReturnResult,
} from "./account-returns";

export const accountReturnBasisLabels: Record<AccountReturnBasis, string> = {
  annualized: "Annualized",
  cumulative: "Cumulative",
};

export function getAccountReturnDisplay(
  result: AccountReturnResult | undefined,
  metric: AccountReturnMetric,
  basis: AccountReturnBasis,
): { value: number | null; explanation: string } {
  const value = result
    ? basis === "cumulative"
      ? result[metric]
      : metric === "twr"
        ? result.annualizedTwr
        : result.annualizedMwr
    : null;
  const explanation = accountReturnExplanation(result, metric);
  if (basis === "cumulative" || !result?.applicable || result[metric] === null)
    return { value, explanation };
  if (value === null) {
    if (result.effectiveStartDate && result.effectiveEndDate) {
      const days = Temporal.PlainDate.from(result.effectiveStartDate).until(
        Temporal.PlainDate.from(result.effectiveEndDate).add({ days: 1 }),
        { largestUnit: "day" },
      ).days;
      if (days < 365)
        return {
          value,
          explanation:
            "Annualized returns require an investment span of at least 365 days. Switch to Cumulative to view this return.",
        };
    }
    return { value, explanation: "The annualized return is unavailable." };
  }
  return {
    value,
    explanation:
      metric === "twr"
        ? "Annualized time-weighted return: compound annual performance excluding capital movements."
        : "Annualized money-weighted return: annual performance reflecting the timing and size of capital movements.",
  };
}
