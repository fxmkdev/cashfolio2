import { defaultAssetClassIds } from "../../../shared/asset-class";
import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountType, Unit } from "@/.prisma-client/enums";
import type { AccountsGridRow, TreeRow } from "./-page-types";
import {
  getAccountListBalanceValue,
  getAccountListUnitIdentifierDisplayValue,
  getAccountListAssetClassValue,
  getAccountListTrackingMethodValue,
  useAccountTreeColumnDefs,
} from "./-page-columns";

function createAccountRow(overrides: Partial<TreeRow> = {}): TreeRow {
  return {
    id: "account-1",
    nodeType: "account",
    name: "Cash",
    type: AccountType.BALANCE,
    equityAccountSubtype: null,
    unit: Unit.CURRENCY,
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: 10,
    balanceInReferenceCurrency: 10,
    openingBalance: null,
    parentId: undefined,
    isActive: true,
    groupId: undefined,
    sortOrder: 1,
    deletable: true,
    deleteDisabledReason: undefined,
    archivable: true,
    archiveDisabledReason: undefined,
    unarchivable: true,
    unarchiveDisabledReason: undefined,
    ...overrides,
  };
}

function createGroupRow(): TreeRow {
  return {
    id: "group-1",
    nodeType: "accountGroup",
    name: "Assets",
    type: AccountType.BALANCE,
    equityAccountSubtype: null,
    unit: null,
    currency: null,
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: null,
    balanceInReferenceCurrency: null,
    openingBalance: null,
    parentId: undefined,
    isActive: true,
    groupId: "group-1",
    sortOrder: 1,
    deletable: true,
    deleteDisabledReason: undefined,
    archivable: true,
    archiveDisabledReason: undefined,
    unarchivable: true,
    unarchiveDisabledReason: undefined,
  };
}

const footerRow: AccountsGridRow = {
  id: "__reference_currency_total_footer__",
  rowType: "referenceCurrencyTotalFooter",
  name: "Total",
  balanceInReferenceCurrency: 10,
};

describe("account list column value getters", () => {
  it.each([
    ["INDIVIDUAL_UNITS", "Individual Units"],
    ["TOTAL_PORTFOLIO_VALUE", "Total Value"],
    [undefined, "Individual Units"],
  ] as const)(
    "displays tracking method %s on active and archived accounts",
    (trackingMethod, label) => {
      for (const isActive of [true, false]) {
        expect(
          getAccountListTrackingMethodValue(
            createAccountRow({ trackingMethod, isActive }),
          ),
        ).toBe(label);
      }
    },
  );

  it.each([Unit.SECURITY, Unit.CRYPTOCURRENCY])(
    "displays Individual Units for %s",
    (unit) => {
      expect(
        getAccountListTrackingMethodValue(createAccountRow({ unit })),
      ).toBe("Individual Units");
    },
  );

  it.each([
    ["INDIVIDUAL_UNITS", "Individual Units"],
    ["TOTAL_PORTFOLIO_VALUE", "Total Value"],
    ["Mixed", "Mixed"],
    [undefined, undefined],
  ] as const)(
    "displays group tracking method %s",
    (groupTrackingMethod, label) => {
      for (const isVirtualArchivedGroup of [true, false]) {
        expect(
          getAccountListTrackingMethodValue({
            ...createGroupRow(),
            groupTrackingMethod,
            isVirtualArchivedGroup,
          }),
        ).toBe(label);
      }
    },
  );

  it("leaves tracking method blank for totals and missing rows", () => {
    expect(getAccountListTrackingMethodValue(footerRow)).toBeUndefined();
    expect(getAccountListTrackingMethodValue(undefined)).toBeUndefined();
  });

  it.each([
    [defaultAssetClassIds.CASH_AND_CASH_EQUIVALENTS, "Cash & Cash Equivalents"],
    [defaultAssetClassIds.EQUITIES, "Equities"],
    [defaultAssetClassIds.FIXED_INCOME, "Fixed Income"],
    [defaultAssetClassIds.REAL_ESTATE, "Real Estate"],

    [
      defaultAssetClassIds.COMMODITIES_AND_PRECIOUS_METALS,
      "Commodities & Precious Metals",
    ],
    [defaultAssetClassIds.DIGITAL_ASSETS, "Digital Assets"],
    [defaultAssetClassIds.ALTERNATIVE_INVESTMENTS, "Alternative Investments"],
    [defaultAssetClassIds.OTHER_ASSETS, "Other Assets"],
    [null, "Unclassified"],
    [undefined, "Unclassified"],
  ] as const)("displays %s using its shared label", (assetClassId, label) => {
    for (const type of [AccountType.BALANCE]) {
      for (const isActive of [true, false]) {
        expect(
          getAccountListAssetClassValue(
            createAccountRow({ assetClassId, type, isActive }),
          ),
        ).toBe(label);
      }
    }
  });

  it.each([
    [defaultAssetClassIds.EQUITIES, "Equities"],
    [null, "Unclassified"],
    ["Mixed", "Mixed"],
  ] as const)("displays group summary %s as %s", (groupAssetClass, label) => {
    for (const isVirtualArchivedGroup of [true, false]) {
      expect(
        getAccountListAssetClassValue({
          ...createGroupRow(),
          groupAssetClass,
          isVirtualArchivedGroup,
        }),
      ).toBe(label);
    }
  });

  it("leaves empty groups, totals, and missing data blank", () => {
    for (const row of [
      createGroupRow(),
      { ...createGroupRow(), isVirtualArchivedGroup: true },
      footerRow,
      undefined,
    ]) {
      expect(getAccountListAssetClassValue(row)).toBeUndefined();
    }
  });

  it.each([true, false])(
    "hides native currency and balance for reference-currency cash accounts (active=%s)",
    (isActive) => {
      const row = createAccountRow({
        currency: "CHF",
        balance: 10,
        isActive,
      });

      expect(
        getAccountListUnitIdentifierDisplayValue({
          data: row,
          referenceCurrency: "CHF",
        }),
      ).toBeUndefined();
      expect(
        getAccountListBalanceValue({
          data: row,
          referenceCurrency: "CHF",
        }),
      ).toBeNull();
    },
  );

  it.each([true, false])(
    "keeps native currency and balance for non-reference-currency cash accounts (active=%s)",
    (isActive) => {
      const row = createAccountRow({
        currency: "USD",
        balance: 20,
        isActive,
      });

      expect(
        getAccountListUnitIdentifierDisplayValue({
          data: row,
          referenceCurrency: "CHF",
        }),
      ).toBe("USD");
      expect(
        getAccountListBalanceValue({
          data: row,
          referenceCurrency: "CHF",
        }),
      ).toBe(20);
    },
  );

  it.each(["CHF", "USD"])(
    "shows security symbols and quantities with %s trade currency",
    (tradeCurrency) => {
      for (const isActive of [true, false]) {
        const row = createAccountRow({
          unit: Unit.SECURITY,
          currency: null,
          tradeCurrency,
          symbol: "ACME",
          balance: 5,
          isActive,
        });

        expect(
          getAccountListUnitIdentifierDisplayValue({
            data: row,
            referenceCurrency: "CHF",
          }),
        ).toBe("ACME");
        expect(
          getAccountListBalanceValue({
            data: row,
            referenceCurrency: "CHF",
          }),
        ).toBe(5);
      }
    },
  );

  it("shows cryptocurrency tickers and quantities for active and archived accounts", () => {
    for (const isActive of [true, false]) {
      const row = createAccountRow({
        unit: Unit.CRYPTOCURRENCY,
        currency: null,
        cryptocurrency: "BTC",
        balance: 2,
        isActive,
      });
      expect(
        getAccountListUnitIdentifierDisplayValue({
          data: row,
          referenceCurrency: "CHF",
        }),
      ).toBe("BTC");
      expect(
        getAccountListBalanceValue({
          data: row,
          referenceCurrency: "CHF",
        }),
      ).toBe(2);
    }
  });

  it("leaves groups, virtual Archived rows, totals, unitless accounts, and missing data blank in unit and native balance columns", () => {
    for (const data of [
      createGroupRow(),
      { ...createGroupRow(), isVirtualArchivedGroup: true },
      footerRow,
      createAccountRow({ unit: null, balance: null }),
      undefined,
    ]) {
      expect(
        getAccountListUnitIdentifierDisplayValue({
          data,
          referenceCurrency: "CHF",
        }),
      ).toBeUndefined();
      expect(
        getAccountListBalanceValue({
          data,
          referenceCurrency: "CHF",
        }),
      ).toBeNull();
    }
  });
});

describe("account tree Delete explanations", () => {
  it.each([true, false])(
    "protects synthetic headings and disables reorder in Asset Class view (active=%s)",
    (isActive) => {
      let render!: (params: { data: TreeRow }) => ReactElement<{
        reorderEnabled: boolean;
        reorderLabel: string;
        onEdit: () => void;
      }> | null;
      const onEdit = vi.fn();
      function Harness() {
        const columns = useAccountTreeColumnDefs({
          grouping: "assetClass",
          isEquityTab: false,
          rowsByParentKey: new Map(),
          referenceCurrency: "CHF",
          isReferenceBalancesLoading: false,
          balanceInReferenceCurrencyByGroupId: new Map(),
          onEditRow: onEdit,
          onUnarchiveRow: async () => {},
          onArchiveRow: () => {},
          onDeleteRow: () => {},
          onReorderRow: () => {},
        });
        const actions = columns.find(
          (column) => "colId" in column && column.colId === "actions",
        );
        if (!actions || !("cellRenderer" in actions))
          throw new Error("Missing actions");
        render = actions.cellRenderer;
        return null;
      }
      renderToStaticMarkup(createElement(Harness));
      for (const presentationKind of [
        "assetClass",
        "unclassified",
        "archived",
      ] as const) {
        expect(
          render({ data: { ...createGroupRow(), presentationKind, isActive } }),
        ).toBeNull();
      }
      const account = createAccountRow({ isActive });
      const action = render({ data: account })!;
      expect(action.props.reorderEnabled).toBe(false);
      expect(action.props.reorderLabel).toBe(
        "Switch to Account Structure to reorder siblings",
      );
      action.props.onEdit();
      expect(onEdit).toHaveBeenCalledWith(account);
    },
  );

  for (const isActive of [true, false]) {
    for (const isEquityTab of [true, false]) {
      it.each(["account", "accountGroup"] as const)(
        `uses contextual wording for ${isActive ? "active" : "archived"} ${isEquityTab ? "category" : "account"} %s rows`,
        (nodeType) => {
          const row =
            nodeType === "account" ? createAccountRow() : createGroupRow();
          row.isActive = isActive;
          row.type = isEquityTab ? AccountType.EQUITY : AccountType.BALANCE;
          row.deletable = false;
          row.deleteDisabledReason =
            nodeType === "account"
              ? "Cannot delete account because it has bookings"
              : "Cannot delete group because it contains accounts";
          let action!: ReactElement<{
            deleteLabel: string;
            deletable: boolean;
          }>;
          function Harness() {
            const columns = useAccountTreeColumnDefs({
              isEquityTab,
              rowsByParentKey: new Map(),
              referenceCurrency: "CHF",
              isReferenceBalancesLoading: false,
              balanceInReferenceCurrencyByGroupId: new Map(),
              onEditRow: () => {},
              onUnarchiveRow: async () => {},
              onArchiveRow: () => {},
              onDeleteRow: () => {},
              onReorderRow: () => {},
            });
            const column = columns.find(
              (candidate) =>
                "colId" in candidate && candidate.colId === "actions",
            );
            if (!column || !("cellRenderer" in column))
              throw new Error("Missing actions column");
            action = column.cellRenderer({ data: row });
            return null;
          }
          renderToStaticMarkup(createElement(Harness));
          expect(action.props.deleteLabel).toBe(
            isEquityTab
              ? nodeType === "account"
                ? "Cannot delete category because it has bookings"
                : "Cannot delete category group because it contains categories"
              : row.deleteDisabledReason,
          );
          expect(action.props.deletable).toBe(false);
        },
      );
    }
  }
});

describe("account classification columns", () => {
  function readColumns(isEquityTab: boolean) {
    let columns: ReturnType<typeof useAccountTreeColumnDefs> = [];
    function ReadColumns() {
      columns = useAccountTreeColumnDefs({
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
