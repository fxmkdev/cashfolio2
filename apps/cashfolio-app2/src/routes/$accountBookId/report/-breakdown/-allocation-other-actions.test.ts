import { expect, test } from "vitest";
import {
  getAllocationOtherAction,
  isAllocationActionKey,
} from "./-allocation-other-actions";

const unmodified = {
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};
test.each(["Enter", " "])("%j activates the focused action cell", (key) => {
  expect(isAllocationActionKey({ key, ...unmodified })).toBe(true);
});
test.each(["Tab", "ArrowDown", "a"])(
  "%s keeps its normal grid behavior",
  (key) => {
    expect(isAllocationActionKey({ key, ...unmodified })).toBe(false);
  },
);
test.each(["altKey", "ctrlKey", "metaKey", "shiftKey"] as const)(
  "%s shortcuts do not activate a row",
  (modifier) => {
    for (const key of ["Enter", " "]) {
      expect(
        isAllocationActionKey({ key, ...unmodified, [modifier]: true }),
      ).toBe(false);
    }
  },
);

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
