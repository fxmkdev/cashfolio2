import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AssetClassContext } from "@/classification-context";
import type { AccountGainLossSummaries } from "@/shared/account-gain-loss";
import { buildUnifiedAccountTreeRows } from "@/shared/archived-account-tree-rows";
import { useAccountsPresentation } from "./-use-accounts-presentation";
import { account, classes, chfUnitId } from "./-asset-class-test-fixtures";
import { assetClassRowId } from "./-asset-class-tree";

function readPresentation(args: Parameters<typeof useAccountsPresentation>[0]) {
  let result: ReturnType<typeof useAccountsPresentation> | undefined;
  function ReadPresentation() {
    result = useAccountsPresentation(args);
    return null;
  }
  renderToStaticMarkup(
    <AssetClassContext value={classes}>
      <ReadPresentation />
    </AssetClassContext>,
  );
  return result!;
}
const leafResult = (id: string, realized: number, missing = false) => ({
  id,
  applicable: true,
  summary: {
    realizedGainLoss: realized,
    unrealizedGainLoss: missing ? null : 0,
    totalGainLoss: missing ? null : realized,
  },
  diagnostics: missing
    ? [{ date: "2026-02-01", message: "Missing valuation." }]
    : [],
});

describe("shared Accounts presentation", () => {
  it("keeps account and class views consistent through archived and incomplete descendants", () => {
    const sourceRows = buildUnifiedAccountTreeRows([
      account("broker", {
        nodeType: "accountGroup",
        parentId: undefined,
        groupId: "broker",
        name: "Broker",
        balanceInReferenceCurrency: null,
      }),
      account("active", { balanceInReferenceCurrency: 0.1 }),
      account("archived", { balanceInReferenceCurrency: 0.2, isActive: false }),
    ]);
    const gainLossData: AccountGainLossSummaries = {
      referenceCurrency: "CHF",
      startDate: "2026-01-01",
      asOfDate: "2026-02-01",
      rows: [
        leafResult("active", 0.1),
        leafResult("archived", 0.2, true),
        leafResult("broker", 0.3, true),
      ],
      total: leafResult("total", 0.3, true),
    };
    const structure = readPresentation({
      sourceRows,
      grouping: "accountStructure",
      isEquityTab: false,
      gainLossData,
    });
    const byClass = readPresentation({
      sourceRows,
      grouping: "assetClass",
      isEquityTab: false,
      gainLossData,
    });
    expect(byClass.pinnedBottomRowData).toEqual(structure.pinnedBottomRowData);
    expect(byClass.pinnedBottomRowData?.[0].balanceInReferenceCurrency).toBe(
      0.3,
    );
    expect(structure.gainLossData).toBe(gainLossData);
    expect(byClass.gainLossData?.total).toBe(gainLossData.total);
    for (const id of [assetClassRowId("equities"), chfUnitId("swiss")]) {
      expect(
        byClass.rows.find((row) => row.id === id)?.balanceInReferenceCurrency,
      ).toBe(0.3);
      expect(
        byClass.gainLossData?.rows.find((row) => row.id === id),
      ).toMatchObject({
        summary: {
          realizedGainLoss: 0.3,
          unrealizedGainLoss: null,
          totalGainLoss: null,
        },
        diagnostics: [{ message: "Missing valuation." }],
      });
    }
    expect(
      structure.rows.find((row) => row.id === "broker")
        ?.balanceInReferenceCurrency,
    ).toBe(0.3);
    expect(
      byClass.rows.find((row) => row.id === "active")?.accountGroupPath,
    ).toEqual(["Broker"]);
    expect(
      byClass.rows
        .filter((row) => row.nodeType === "account")
        .map((row) => row.id)
        .sort(),
    ).toEqual(["active", "archived"]);
  });
  it("keeps missing balances incomplete and omits financial totals for category management", () => {
    const sourceRows = [
      account("missing", { balanceInReferenceCurrency: null }),
    ];
    const accounts = readPresentation({
      sourceRows,
      grouping: "assetClass",
      isEquityTab: false,
    });
    expect(
      accounts.pinnedBottomRowData?.[0].balanceInReferenceCurrency,
    ).toBeNull();
    expect(
      accounts.rows.find((row) => row.id === chfUnitId("swiss"))
        ?.balanceInReferenceCurrency,
    ).toBeNull();
    expect(accounts.gainLossData).toBeUndefined();
    const categories = readPresentation({
      sourceRows,
      grouping: "accountStructure",
      isEquityTab: true,
    });
    expect(categories.rows).toEqual(sourceRows);
    expect(categories.pinnedBottomRowData).toBeUndefined();
    expect(categories.balanceInReferenceCurrencyByGroupId.size).toBe(0);
  });
});
