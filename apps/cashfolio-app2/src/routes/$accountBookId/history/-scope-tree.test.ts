import { describe, expect, test } from "vitest";
import { HISTORY_METRIC_OPTIONS } from "./-page-types";
import {
  buildHistoryViewTreeData,
  getHistoryScopeTreeSearchLabel,
  getHistoryViewTreeSelection,
  getHistoryViewTreeValue,
  buildHistoryScopeTreeData,
} from "./-scope-tree";

describe("buildHistoryScopeTreeData", () => {
  test("keeps total first and nests groups and accounts", () => {
    expect(
      buildHistoryScopeTreeData([
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
      buildHistoryScopeTreeData([
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
      buildHistoryScopeTreeData([
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
      buildHistoryScopeTreeData([
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
      buildHistoryScopeTreeData([
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

const emptyScopeOptions = {
  cashFlow: [],
  income: [],
  expenses: [],
  gainsLosses: [],
  netWorth: [],
};

describe("unified history view tree", () => {
  test("keeps all views in order as selectable totals, even without children", () => {
    const data = buildHistoryViewTreeData(emptyScopeOptions);
    expect(data.map((node) => node.label)).toEqual(
      HISTORY_METRIC_OPTIONS.map((option) => option.label),
    );
    for (const [index, node] of data.entries()) {
      expect(node.children).toBeUndefined();
      expect(
        getHistoryViewTreeSelection(node.value, emptyScopeOptions),
      ).toEqual({
        metric: HISTORY_METRIC_OPTIONS[index].value,
        scope: "total",
      });
    }
  });

  test("nests groups and accounts under their metric and removes redundant totals", () => {
    const scopeOptions = {
      ...emptyScopeOptions,
      netWorth: [
        { value: "total", label: "Total", kind: "total" },
        { value: "group:assets", label: "Assets", kind: "group" },
        {
          value: "group:cash",
          label: "Assets / Cash",
          treeLabel: "Cash",
          kind: "group",
          parentValue: "group:assets",
        },
        {
          value: "account:shared",
          label: "Assets / Cash / Bank",
          treeLabel: "Bank",
          kind: "account",
          parentValue: "group:cash",
        },
        { value: "account:ungrouped", label: "Ungrouped", kind: "account" },
      ] as const,
    };
    const options = { ...scopeOptions, netWorth: [...scopeOptions.netWorth] };
    const root = buildHistoryViewTreeData(options).find(
      (node) => node.value === "netWorth:total",
    )!;
    for (const metric of ["assets", "liabilities"] as const) {
      const aggregate = buildHistoryViewTreeData(options).find(
        (node) => node.value === `${metric}:total`,
      )!;
      expect(aggregate.children).toBeUndefined();
      expect(getHistoryViewTreeSelection(aggregate.value, options)).toEqual({
        metric,
        scope: "total",
      });
      expect(
        getHistoryViewTreeSelection(`${metric}:account:shared`, options),
      ).toBeUndefined();
    }
    expect(root.children?.map((node) => node.value)).toEqual([
      "netWorth:group:assets",
      "netWorth:account:ungrouped",
    ]);
    const account = root.children![0].children![0].children![0];
    expect(account.label).toBe("Bank");
    expect(getHistoryScopeTreeSearchLabel(account)).toBe(
      "Net Worth / Assets / Cash / Bank",
    );
    expect(getHistoryViewTreeSelection(account.value, options)).toEqual({
      metric: "netWorth",
      scope: "account:shared",
    });
    expect(
      getHistoryViewTreeSelection(root.children![0].value, options),
    ).toEqual({ metric: "netWorth", scope: "group:assets" });
  });

  test("namespaces the same account across Cash Flow and Net Worth", () => {
    const account = {
      value: "account:bank",
      label: "Bank",
      kind: "account",
    } as const;
    const options = {
      ...emptyScopeOptions,
      cashFlow: [account],
      netWorth: [account],
    };
    const data = buildHistoryViewTreeData(options);
    const values = data.flatMap(
      (node) => node.children?.map((child) => child.value) ?? [],
    );
    expect(values).toEqual(["cashFlow:account:bank", "netWorth:account:bank"]);
    for (const metric of ["cashFlow", "netWorth"] as const) {
      const selection = { metric, scope: account.value };
      expect(
        getHistoryViewTreeSelection(
          getHistoryViewTreeValue(selection),
          options,
        ),
      ).toEqual(selection);
    }
  });

  test("preserves Gain/Loss hierarchy and colon-delimited account IDs", () => {
    const options = {
      ...emptyScopeOptions,
      gainsLosses: [
        { value: "unit-type:security", label: "Securities", kind: "gainLoss" },
        {
          value: "unit:security:AAPL:USD",
          label: "Securities / AAPL",
          treeLabel: "AAPL",
          kind: "gainLoss",
          parentValue: "unit-type:security",
        },
        {
          value: "unit-account:security:AAPL:USD:bank",
          label: "Securities / AAPL / Bank",
          treeLabel: "Bank",
          kind: "gainLoss",
          parentValue: "unit:security:AAPL:USD",
        },
      ] as const,
    };
    const mutableOptions = {
      ...options,
      gainsLosses: [...options.gainsLosses],
    };
    const root = buildHistoryViewTreeData(mutableOptions).find(
      (node) => node.value === "gainsLosses:total",
    )!;
    const account = root.children![0].children![0].children![0];
    expect(account.value).toBe(
      "gainsLosses:unit-account:security:AAPL:USD:bank",
    );
    expect(getHistoryViewTreeSelection(account.value, mutableOptions)).toEqual({
      metric: "gainsLosses",
      scope: "unit-account:security:AAPL:USD:bank",
    });
  });

  test.each([
    null,
    "",
    "assets",
    "unknown:total",
    "netWorth:invalid",
    "netWorth:account:missing",
    "savings:account:bank",
    "netWorth:group:",
  ])("rejects invalid or unavailable selection %s", (value) => {
    expect(
      getHistoryViewTreeSelection(value, emptyScopeOptions),
    ).toBeUndefined();
  });

  test("uses the node label when a custom search label is absent", () => {
    expect(
      getHistoryScopeTreeSearchLabel({
        value: "netWorth:total",
        label: "Net Worth",
      }),
    ).toBe("Net Worth");
  });
});
