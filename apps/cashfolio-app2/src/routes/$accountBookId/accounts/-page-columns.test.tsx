import { defaultAssetClassIds } from "../../../shared/asset-class";
import { describe, expect, it, vi } from "vitest";
import { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AccountsGridRow, TreeRow } from "./-page-types";
import type { ReportingGrouping } from "@/shared/reporting-grouping";
import { useAccountTreeColumnDefs } from "./-page-columns";
import {
  createAccountRow,
  createGroupRow,
  footerRow,
} from "./-column-test-fixtures";
describe("account classification columns", () => {
  function readColumns(
    isEquityTab: boolean,
    grouping: ReportingGrouping = "accountStructure",
  ) {
    let columns: ReturnType<typeof useAccountTreeColumnDefs> = [];
    function ReadColumns() {
      columns = useAccountTreeColumnDefs({
        grouping,
        isEquityTab,
        rowsByParentKey: new Map(),
        referenceCurrency: "CHF",
        isReferenceBalancesLoading: false,
        balanceInReferenceCurrencyByGroupId: new Map(),
        onEditRow: vi.fn(),
        onUnarchiveRow: vi.fn(),
        onArchiveRow: vi.fn(),
        onDeleteRow: vi.fn(),
        onReorderRow: vi.fn(),
      });
      return null;
    }
    renderToStaticMarkup(<ReadColumns />);
    return columns;
  }

  it("follows the balance columns with label filtering, tooltips, and resizing", () => {
    const columns = readColumns(false);
    expect(columns).toMatchObject([
      {
        colId: "unitIdentifier",
        headerName: "Ccy./Symbol",
        initialWidth: 180,
        resizable: true,
        filter: "agTextColumnFilter",
      },
      { field: "balance" },
      { field: "balanceInReferenceCurrency" },
      { colId: "assetClass" },
      { colId: "trackingMethod" },
      { groupId: "holding-gain-loss" },
      { colId: "actions", pinned: "right" },
    ]);
    expect(columns[3]).toMatchObject({
      colId: "assetClass",
      headerName: "Asset Class",
      width: 220,
      resizable: true,
      sortable: false,
      filter: "agTextColumnFilter",
      valueGetter: expect.any(Function),
      tooltipValueGetter: expect.any(Function),
    });
  });

  it("does not add classification columns on equity tabs", () => {
    expect(readColumns(true)).toHaveLength(1);
    expect(readColumns(true)[0]).toMatchObject({
      colId: "actions",
      pinned: "right",
    });
  });

  it("replaces Asset Class with Path in the same position and keeps neighboring columns", () => {
    const columns = readColumns(false, "assetClass");
    expect(columns[3]).toMatchObject({
      colId: "path",
      headerName: "Path",
      width: 220,
      resizable: true,
      sortable: false,
      filter: "agTextColumnFilter",
    });
    expect(columns[4]).toMatchObject({ colId: "trackingMethod" });
    expect(
      columns.some(
        (column) => "colId" in column && column.colId === "assetClass",
      ),
    ).toBe(false);
    expect(readColumns(true, "assetClass")).toHaveLength(1);
  });

  it("uses original group paths for Path display, filtering and tooltips on active and archived accounts", () => {
    const column = readColumns(false, "assetClass")[3];
    if (
      !("valueGetter" in column) ||
      typeof column.valueGetter !== "function" ||
      typeof column.tooltipValueGetter !== "function"
    )
      throw new Error("Missing Path getters");
    const cases: Array<[AccountsGridRow | undefined, string | undefined]> = [
      [
        createAccountRow({ accountGroupPath: ["Cash", "Swissquote"] }),
        "Cash / Swissquote",
      ],
      [
        createAccountRow({
          isActive: false,
          accountGroupPath: ["Cash", "Swissquote"],
        }),
        "Cash / Swissquote",
      ],
      [createAccountRow({ accountGroupPath: ["Cash"] }), "Cash"],
      [createAccountRow({ accountGroupPath: [] }), undefined],
      [createAccountRow(), undefined],
      ...(["assetClass", "unclassified", "unit", "archived"] as const).map(
        (presentationKind) =>
          [
            {
              ...createGroupRow(),
              presentationKind,
              accountGroupPath: ["Ignored"],
            },
            undefined,
          ] as [TreeRow, undefined],
      ),
      [footerRow, undefined],
      [undefined, undefined],
    ];
    for (const [data, expected] of cases) {
      expect(
        column.valueGetter({ data } as Parameters<
          typeof column.valueGetter
        >[0]),
      ).toBe(expected);
      expect(
        column.tooltipValueGetter({ data } as Parameters<
          typeof column.tooltipValueGetter
        >[0]),
      ).toBe(expected);
    }
  });

  it("places Tracking Method after Asset Class with label filtering and tooltips", () => {
    const column = readColumns(false)[4];
    expect(column).toMatchObject({
      colId: "trackingMethod",
      headerName: "Tracking Method",
      initialWidth: 220,
      resizable: true,
      sortable: false,
      filter: "agTextColumnFilter",
      valueGetter: expect.any(Function),
      tooltipValueGetter: expect.any(Function),
    });
    if (
      !("valueGetter" in column) ||
      typeof column.valueGetter !== "function" ||
      typeof column.tooltipValueGetter !== "function"
    ) {
      throw new Error("Missing tracking method getters");
    }
    for (const data of [
      createAccountRow({ trackingMethod: "TOTAL_PORTFOLIO_VALUE" }),
      {
        ...createGroupRow(),
        groupTrackingMethod: "TOTAL_PORTFOLIO_VALUE" as const,
      },
    ]) {
      expect(
        column.valueGetter({ data } as Parameters<
          typeof column.valueGetter
        >[0]),
      ).toBe("Total Value");
      expect(
        column.tooltipValueGetter({ data } as Parameters<
          typeof column.tooltipValueGetter
        >[0]),
      ).toBe("Total Value");
    }
  });

  it.each([
    [defaultAssetClassIds.EQUITIES, "Equities"],
    [null, "Unclassified"],
    ["Mixed", "Mixed"],
    [undefined, undefined],
  ] as const)(
    "uses the group display label for filtering and tooltips (%s)",
    (groupAssetClass, label) => {
      const column = readColumns(false).find(
        (candidate) => "colId" in candidate && candidate.colId === "assetClass",
      );
      if (
        !column ||
        !("valueGetter" in column) ||
        typeof column.valueGetter !== "function" ||
        typeof column.tooltipValueGetter !== "function"
      ) {
        throw new Error("Missing asset class getters");
      }
      const data = { ...createGroupRow(), groupAssetClass };
      expect(
        column.valueGetter({ data } as Parameters<
          typeof column.valueGetter
        >[0]),
      ).toBe(label);
      expect(
        column.tooltipValueGetter({ data } as Parameters<
          typeof column.tooltipValueGetter
        >[0]),
      ).toBe(label);
      const rendered = column.cellRenderer({ value: label });
      if (label === "Unclassified") {
        expect(
          (rendered as ReactElement<{ c: string; children: string }>).props,
        ).toMatchObject({ c: "dimmed", children: "Unclassified" });
      } else {
        expect(rendered).toBe(label ?? null);
      }
    },
  );
});
