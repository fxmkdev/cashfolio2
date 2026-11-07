import { describe, expect, it } from "vitest";
import { getLedgerAccountSwitcherOptions } from "./account-switcher-options";

const data = [
  {
    value: "bank",
    label: "Bank",
    children: [
      {
        value: "first",
        label: "First",
        children: [
          { value: "checking", label: "Checking" },
          { value: "savings", label: "Savings" },
        ],
      },
      {
        value: "last",
        label: "Last",
        children: [{ value: "travel", label: "Travel" }],
      },
    ],
  },
  { value: "ungrouped", label: "Ungrouped" },
];

describe("ledger TreeSelect option adapter", () => {
  it("maps sibling endings and continuing ancestor lines at each depth", () => {
    const options = getLedgerAccountSwitcherOptions(data, {
      bank: true,
      first: true,
      last: true,
    });
    expect(
      options.map(({ node, parent, level, isLastChild, lineGuides }) => ({
        value: node.value,
        parent,
        level,
        isLastChild,
        lineGuides,
      })),
    ).toEqual([
      {
        value: "bank",
        parent: null,
        level: 1,
        isLastChild: false,
        lineGuides: [],
      },
      {
        value: "first",
        parent: "bank",
        level: 2,
        isLastChild: false,
        lineGuides: [],
      },
      {
        value: "checking",
        parent: "first",
        level: 3,
        isLastChild: false,
        lineGuides: [true],
      },
      {
        value: "savings",
        parent: "first",
        level: 3,
        isLastChild: true,
        lineGuides: [true],
      },
      {
        value: "last",
        parent: "bank",
        level: 2,
        isLastChild: true,
        lineGuides: [],
      },
      {
        value: "travel",
        parent: "last",
        level: 3,
        isLastChild: true,
        lineGuides: [false],
      },
      {
        value: "ungrouped",
        parent: null,
        level: 1,
        isLastChild: true,
        lineGuides: [],
      },
    ]);
    expect(options[0]).toMatchObject({ expanded: true, hasChildren: true });
    expect(options[2]).toMatchObject({ expanded: false, hasChildren: false });
    expect(options[2]!.node).toBe(data[0]!.children![0]!.children![0]);
  });

  it("only emits visible rows and preserves connector metadata beside collapsed branches", () => {
    const options = getLedgerAccountSwitcherOptions(data, {
      bank: true,
      last: true,
    });
    expect(options.map(({ node }) => node.value)).toEqual([
      "bank",
      "first",
      "last",
      "travel",
      "ungrouped",
    ]);
    expect(options[1]).toMatchObject({
      expanded: false,
      hasChildren: true,
      isLastChild: false,
    });
    expect(options[3]).toMatchObject({
      lineGuides: [false],
      isLastChild: true,
    });
    expect(
      getLedgerAccountSwitcherOptions(data, {}).map(({ node }) => node.value),
    ).toEqual(["bank", "ungrouped"]);
    expect(getLedgerAccountSwitcherOptions([], {})).toEqual([]);
  });
});
