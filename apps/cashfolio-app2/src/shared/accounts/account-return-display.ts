import { Temporal } from "../temporal";
import {
  accountReturnExplanation,
  type AccountReturnBasis,
  type AccountReturnResult,
} from "./account-returns";

export const accountReturnBasisLabels: Record<AccountReturnBasis, string> = {
  annualized: "Annualized",
  cumulative: "Cumulative",
};

export function getAccountReturnDisplay(
  result: AccountReturnResult | undefined,
  basis: AccountReturnBasis,
): { value: number | null; explanation: string } {
  const value = result
    ? basis === "cumulative"
      ? result.mwr
      : result.annualizedMwr
    : null;
  const explanation = accountReturnExplanation(result);
  if (basis === "cumulative" || !result?.applicable || result.mwr === null)
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
    return {
      value,
      explanation: "The annualized money-weighted return is unavailable.",
    };
  }
  return {
    value,
    explanation:
      "Annualized money-weighted return reflects how your money performed per year, accounting for the amounts and dates invested or withdrawn.",
  };
}
