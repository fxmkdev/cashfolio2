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
