import { expect, it } from "vitest";
import { getAccountReturnDisplay } from "./account-return-display";
import {
  emptyAccountReturnResult,
  type AccountReturnResult,
} from "./account-returns";
const result: AccountReturnResult = {
  ...emptyAccountReturnResult(),
  mwr: 0.25,
  annualizedMwr: 0.12,
  effectiveStartDate: "2024-01-01",
  effectiveEndDate: "2025-12-31",
};
it("selects supplied money-weighted values without calculating or substituting returns", () => {
  expect(getAccountReturnDisplay(result, "cumulative").value).toBe(0.25);
  expect(getAccountReturnDisplay(result, "annualized").value).toBe(0.12);
  expect(getAccountReturnDisplay(result, "annualized").explanation).toContain(
    "Annualized money-weighted",
  );
});
it.each([
  ["2025-01-01", "2025-12-30", true],
  ["2025-01-01", "2025-12-31", false],
  ["2024-01-01", "2024-12-29", true],
  ["2024-01-01", "2024-12-30", false],
  ["2026-01-01", "2026-01-01", true],
])("uses inclusive effective days for %s through %s", (start, end, short) => {
  const display = getAccountReturnDisplay(
    {
      ...result,
      effectiveStartDate: start,
      effectiveEndDate: end,
      annualizedMwr: null,
    },
    "annualized",
  );
  expect(display.value).toBeNull();
  expect(display.explanation.includes("365 days")).toBe(short);
});
it.each([-1, -0.25, 0])("preserves losses and zeroes (%s)", (value) => {
  const loss = { ...result, mwr: value, annualizedMwr: value };
  expect(getAccountReturnDisplay(loss, "annualized").value).toBe(value);
  expect(getAccountReturnDisplay(loss, "cumulative").value).toBe(value);
});
it("preserves solver failures ahead of the short-span explanation", () => {
  const ambiguous = {
    ...result,
    mwr: null,
    annualizedMwr: null,
    effectiveEndDate: "2024-01-02",
    diagnostics: [{ message: "Multiple money-weighted returns are possible." }],
  };
  expect(getAccountReturnDisplay(ambiguous, "annualized")).toEqual({
    value: null,
    explanation: "Multiple money-weighted returns are possible.",
  });
});
it("keeps missing and inapplicable results explained", () => {
  expect(getAccountReturnDisplay(undefined, "annualized")).toEqual({
    value: null,
    explanation: "Return is unavailable.",
  });
  expect(
    getAccountReturnDisplay(emptyAccountReturnResult(false), "annualized")
      .explanation,
  ).toBe("Return is shown for accounts reporting G/L.");
});
it("requires effective dates before attributing unavailability to a short span", () => {
  expect(
    getAccountReturnDisplay(
      { ...result, annualizedMwr: null, effectiveStartDate: null },
      "annualized",
    ),
  ).toEqual({
    value: null,
    explanation: "The annualized money-weighted return is unavailable.",
  });
});
