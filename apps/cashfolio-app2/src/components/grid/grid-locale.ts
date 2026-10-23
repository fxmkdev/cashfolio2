import type { LocaleText } from "ag-grid-enterprise";
import {
  DEFAULT_USER_LOCALE,
  normalizeUserLocaleInput,
  type UserLocale,
} from "@/user-locale";

// Cashfolio UI copy conventions; instructions and status text use sentence case.
export const GRID_UI_TEXT: LocaleText = {
  notEqual: "Does Not Equal",
  lessThan: "Less Than",
  greaterThan: "Greater Than",
  lessThanOrEqual: "Less than or Equal To",
  greaterThanOrEqual: "Greater than or Equal To",
  notContains: "Does Not Contain",
  startsWith: "Begins With",
  endsWith: "Ends With",
  notBlank: "Not Blank",
  andCondition: "And",
  orCondition: "Or",
  yearToDate: "Year to Date",
  ariaFilteringOperator: "Filtering Operator",
  ariaFilterFromValue: "Filter from Value",
  ariaFilterToValue: "Filter to Value",
  ariaColumnFiltered: "Column filtered",
  ariaRowSelectionDisabled: "Row selection is disabled for this row",
  noRowsToShow: "No rows to show",
  invalidDate: "Invalid date",
  invalidNumber: "Invalid number",
  invalidBigInt: "Invalid BigInt",
};

export function getGridUserLocale(context: unknown): UserLocale {
  if (
    typeof context === "object" &&
    context !== null &&
    "userLocale" in context
  ) {
    return normalizeUserLocaleInput(
      (context as { userLocale?: unknown }).userLocale,
    );
  }

  return DEFAULT_USER_LOCALE;
}
