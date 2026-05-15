import { describe, expect, test } from "vitest";
import { buildTimelineScopeTreeData } from "./-scope-tree";

describe("buildTimelineScopeTreeData", () => {
  test("keeps total first and nests groups and accounts", () => {
    expect(
      buildTimelineScopeTreeData([
        { value: "total", label: "Total", kind: "total" },
        {
          value: "group:income",
          label: "Income",
          kind: "group",
          treeLabel: "Income",
        },
        {
          value: "group:salary",
          label: "Income / Salary",
          kind: "group",
          treeLabel: "Salary",
          parentValue: "group:income",
        },
        {
          value: "account:primary-salary",
          label: "Income / Salary / Primary Salary",
          kind: "account",
          treeLabel: "Primary Salary",
          parentValue: "group:salary",
        },
      ]),
    ).toEqual([
      {
        value: "total",
        label: "Total",
        nodeProps: { searchLabel: "Total" },
      },
      {
        value: "group:income",
        label: "Income",
        nodeProps: { searchLabel: "Income" },
        children: [
          {
            value: "group:salary",
            label: "Salary",
            nodeProps: { searchLabel: "Income / Salary" },
            children: [
              {
                value: "account:primary-salary",
                label: "Primary Salary",
                nodeProps: {
                  searchLabel: "Income / Salary / Primary Salary",
                },
              },
            ],
          },
        ],
      },
    ]);
  });

  test("keeps ungrouped accounts at root", () => {
    expect(
      buildTimelineScopeTreeData([
        {
          value: "account:consulting",
          label: "Consulting",
          kind: "account",
          treeLabel: "Consulting",
        },
      ]),
    ).toEqual([
      {
        value: "account:consulting",
        label: "Consulting",
        nodeProps: { searchLabel: "Consulting" },
      },
    ]);
  });

  test("nests Gain/Loss hierarchy node values", () => {
    expect(
      buildTimelineScopeTreeData([
        {
          value: "unit-type:fx",
          label: "FX",
          kind: "gainLoss",
          treeLabel: "FX",
        },
        {
          value: "unit:fx:USD",
          label: "FX / USD",
          kind: "gainLoss",
          treeLabel: "USD",
          parentValue: "unit-type:fx",
        },
        {
          value: "unit-account:fx:USD:cash-1",
          label: "FX / USD / USD Cash",
          kind: "gainLoss",
          treeLabel: "USD Cash",
          parentValue: "unit:fx:USD",
        },
        {
          value: "unit-type:explicit",
          label: "Explicit G/L",
          kind: "gainLoss",
          treeLabel: "Explicit G/L",
        },
        {
          value: "explicit-account:cash-1",
          label: "Explicit G/L / Cash",
          kind: "gainLoss",
          treeLabel: "Cash",
          parentValue: "unit-type:explicit",
        },
      ]),
    ).toEqual([
      {
        value: "unit-type:fx",
        label: "FX",
        nodeProps: { searchLabel: "FX" },
        children: [
          {
            value: "unit:fx:USD",
            label: "USD",
            nodeProps: { searchLabel: "FX / USD" },
            children: [
              {
                value: "unit-account:fx:USD:cash-1",
                label: "USD Cash",
                nodeProps: { searchLabel: "FX / USD / USD Cash" },
              },
            ],
          },
        ],
      },
      {
        value: "unit-type:explicit",
        label: "Explicit G/L",
        nodeProps: { searchLabel: "Explicit G/L" },
        children: [
          {
            value: "explicit-account:cash-1",
            label: "Cash",
            nodeProps: { searchLabel: "Explicit G/L / Cash" },
          },
        ],
      },
    ]);
  });

  test("promotes nodes with missing parents to root", () => {
    expect(
      buildTimelineScopeTreeData([
        {
          value: "account:orphan",
          label: "Missing / Orphan",
          kind: "account",
          treeLabel: "Orphan",
          parentValue: "group:missing",
        },
      ]),
    ).toEqual([
      {
        value: "account:orphan",
        label: "Orphan",
        nodeProps: { searchLabel: "Missing / Orphan" },
      },
    ]);
  });

  test("promotes nodes with cyclic parents to root", () => {
    expect(
      buildTimelineScopeTreeData([
        {
          value: "group:a",
          label: "A",
          kind: "group",
          treeLabel: "A",
          parentValue: "group:b",
        },
        {
          value: "group:b",
          label: "B",
          kind: "group",
          treeLabel: "B",
          parentValue: "group:a",
        },
      ]),
    ).toEqual([
      {
        value: "group:a",
        label: "A",
        nodeProps: { searchLabel: "A" },
      },
      {
        value: "group:b",
        label: "B",
        nodeProps: { searchLabel: "B" },
      },
    ]);
  });
});
