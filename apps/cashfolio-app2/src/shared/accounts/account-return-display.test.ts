import { expect, it } from "vitest";
import { getAccountReturnDisplay } from "./account-return-display";
import {
  emptyAccountReturnResult,
  type AccountReturnResult,
} from "./account-returns";

const result: AccountReturnResult = {
  ...emptyAccountReturnResult(),
  twr: 0.21,
  mwr: 0.25,
  annualizedTwr: 0.1,
  annualizedMwr: 0.12,
  effectiveStartDate: "2024-01-01",
  effectiveEndDate: "2025-12-31",
};

it("selects the supplied values without calculating or substituting returns", () => {
  expect(getAccountReturnDisplay(result, "twr", "cumulative").value).toBe(0.21);
  expect(getAccountReturnDisplay(result, "mwr", "cumulative").value).toBe(0.25);
  expect(getAccountReturnDisplay(result, "twr", "annualized").value).toBe(0.1);
  expect(getAccountReturnDisplay(result, "mwr", "annualized").value).toBe(0.12);
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
      annualizedTwr: null,
    },
    "twr",
    "annualized",
  );
  expect(display.value).toBeNull();
  expect(display.explanation.includes("365 days")).toBe(short);
});

it.each(["twr", "mwr"] as const)("preserves %s losses and zeroes", (metric) => {
  for (const value of [-1, -0.25, 0]) {
    const loss = {
      ...result,
      [metric]: value,
      annualizedTwr: value,
      annualizedMwr: value,
    };
    expect(getAccountReturnDisplay(loss, metric, "annualized").value).toBe(
      value,
    );
    expect(getAccountReturnDisplay(loss, metric, "cumulative").value).toBe(
      value,
    );
  }
});

it("preserves independent metric failures ahead of the short-span explanation", () => {
  const ambiguous = {
    ...result,
    mwr: null,
    annualizedMwr: null,
    effectiveEndDate: "2024-01-02",
    diagnostics: [
      { metric: "mwr" as const, message: "Multiple roots are possible." },
    ],
  };
  expect(getAccountReturnDisplay(ambiguous, "mwr", "annualized")).toEqual({
    value: null,
    explanation: "Multiple roots are possible.",
  });
  expect(getAccountReturnDisplay(ambiguous, "twr", "annualized").value).toBe(
    0.1,
  );
});

it("keeps missing and inapplicable results explained", () => {
  expect(getAccountReturnDisplay(undefined, "twr", "annualized")).toEqual({
    value: null,
    explanation: "Returns are unavailable.",
  });
  expect(
    getAccountReturnDisplay(
      emptyAccountReturnResult(false),
      "twr",
      "annualized",
    ).explanation,
  ).toBe("Returns are shown for accounts reporting G/L.");
});

it("requires actual effective dates before attributing unavailability to a short span", () => {
  expect(
    getAccountReturnDisplay(
      { ...result, annualizedTwr: null, effectiveStartDate: null },
      "twr",
      "annualized",
    ),
  ).toEqual({
    value: null,
    explanation: "The annualized return is unavailable.",
  });
});
