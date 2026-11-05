import { expect, test } from "vitest";
import { getAllocationOtherAction } from "./-allocation-other-actions";

test.each([
  {
    id: "group:bank",
    kind: "group",
    isDrillable: true,
    expected: "Drill Down",
  },
  { id: "group:empty", kind: "group", isDrillable: false, expected: null },
  {
    id: "account:bank",
    kind: "account",
    isDrillable: false,
    expected: "Open Ledger",
  },
  {
    id: "account:virtual:transfer-clearing:account:currency:USD",
    kind: "account",
    isDrillable: false,
    expected: null,
  },
  { id: "account:", kind: "account", isDrillable: false, expected: null },
  { id: "unsupported", kind: "account", isDrillable: false, expected: null },
  {
    id: "__allocation_other__",
    kind: "other",
    isDrillable: false,
    expected: null,
  },
] as const)("$id exposes only a supported action", ({ expected, ...datum }) => {
  expect(getAllocationOtherAction(datum)).toBe(expected);
});
