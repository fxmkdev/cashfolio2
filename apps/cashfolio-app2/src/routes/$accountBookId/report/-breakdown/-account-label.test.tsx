import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  getReportNodeLabel,
  getReportRowLabel,
  ReportNameCell,
} from "./-account-label";
import { flattenBreakdownHierarchyRows } from "./-breakdown-table-rows";
import { flattenGainsLossesHierarchyRows } from "../-gains-losses/-gains-losses-table-rows";
import { buildGainsLossesWaterfallModel } from "../-gains-losses/-gains-losses-waterfall-model";

describe("Report account paths", () => {
  const node = {
    id: "account:apple",
    label: "Apple",
    accountGroupPath: ["Bank", "Brokerage"],
    children: [],
  };

  test("keeps account-group context in allocation rows, filter values and chart labels", () => {
    const [row] = flattenBreakdownHierarchyRows([
      { ...node, kind: "account", amount: 100 },
    ]);
    expect(row.name).toBe("Apple");
    expect(row.accountGroupPath).toEqual(["Bank", "Brokerage"]);
    expect(getReportRowLabel(row)).toBe("Bank / Brokerage / Apple");
    expect(getReportNodeLabel(node)).toBe("Bank / Brokerage / Apple");
    const markup = renderToStaticMarkup(
      <MantineProvider>
        <ReportNameCell data={row} />
      </MantineProvider>,
    );
    expect(markup).toContain(">Apple</p>");
    expect(markup).toContain(">Bank / Brokerage</p>");
  });

  test("keeps G/L account paths in table rows and waterfall data without changing IDs", () => {
    const hierarchy = [
      {
        ...node,
        id: "gain-loss-account:apple",
        realizedGainLoss: 1,
        unrealizedGainLoss: 2,
        totalGainLoss: 3,
      },
    ];
    const [row] = flattenGainsLossesHierarchyRows(hierarchy);
    expect(getReportRowLabel(row)).toBe("Bank / Brokerage / Apple");
    expect(
      buildGainsLossesWaterfallModel({ nodes: hierarchy }).data[0],
    ).toMatchObject({
      id: "gain-loss-account:apple",
      label: "Bank / Brokerage / Apple",
    });
  });

  test("preserves names for ungrouped, synthetic and Account Structure nodes", () => {
    expect(getReportNodeLabel({ label: "Cash", accountGroupPath: [] })).toBe(
      "Cash",
    );
    expect(getReportRowLabel({ name: "Transfer Clearing" })).toBe(
      "Transfer Clearing",
    );
    expect(getReportRowLabel(undefined)).toBeUndefined();
    expect(
      renderToStaticMarkup(<ReportNameCell data={{ name: "Total" }} />),
    ).toBe("Total");
  });
});
