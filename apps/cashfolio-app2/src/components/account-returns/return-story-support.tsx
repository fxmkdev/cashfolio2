import { Drawer } from "@mantine/core";
import { useState, useEffect, useRef } from "react";
import { fn } from "storybook/test";
import type { GridApi } from "ag-grid-enterprise";
import { DataGrid } from "@/components/grid/data-grid";
import type {
  AccountReturnBasis,
  AccountReturnDetails,
  AccountReturnSummaries,
  AccountReturnTarget,
} from "@/shared/accounts/account-returns";
import { buildAccountReturnColumns } from "@/components/account-management/returns/columns";
import { ReturnCalculation } from "./return-calculation";

export const data: AccountReturnDetails = {
  applicable: true,
  twr: 0.21,
  mwr: 0.21,
  annualizedTwr: 0.1,
  annualizedMwr: 0.1,
  effectiveStartDate: "2025-01-01",
  effectiveEndDate: "2026-12-31",
  diagnostics: [],
  startDate: "2025-01-01",
  asOfDate: "2026-12-31",
  referenceCurrency: "CHF",
  name: "Investments",
  valuations: [
    {
      id: "year",
      startDate: "2025-01-01",
      date: "2025-12-31",
      openingValue: 1000,
      closingValue: 1100,
      contributions: 0,
      withdrawals: 0,
      factor: 1.1,
    },
    {
      id: "second",
      startDate: "2026-01-01",
      date: "2026-12-31",
      openingValue: 1100,
      closingValue: 2310,
      contributions: 1000,
      withdrawals: 0,
      factor: 1.1,
    },
  ],
  cashFlows: [
    {
      id: "deposit",
      date: "2026-01-01",
      amount: 1000,
      transactionId: "deposit-transaction",
      description: "Additional Investment",
    },
  ],
};
export const selected = fn();
export function ReturnGridExample({
  basis = "annualized",
  loading = false,
  completedIds,
  unavailable = false,
}: {
  basis?: AccountReturnBasis;
  loading?: boolean;
  completedIds?: Set<string>;
  unavailable?: boolean;
}) {
  const grid = useRef<GridApi | null>(null);
  useEffect(() => {
    grid.current?.refreshCells({
      columns: ["return-twr", "return-mwr"],
      force: true,
    });
  }, [basis, loading, completedIds]);
  const [target, setTarget] = useState<AccountReturnTarget>();
  const summary: AccountReturnSummaries = {
    referenceCurrency: "CHF",
    startDate: data.startDate,
    asOfDate: data.asOfDate,
    rows: [
      {
        id: "a",
        ...data,
        ...(unavailable
          ? {
              twr: null,
              mwr: null,
              annualizedTwr: null,
              annualizedMwr: null,
              diagnostics: [
                {
                  metric: "both" as const,
                  message:
                    "Returns are unavailable because a closing valuation is missing.",
                },
              ],
            }
          : {}),
      },
      { id: "group", ...data },
    ],
    total: data,
  };
  const columns = buildAccountReturnColumns({
    basis,
    data: summary,
    loading,
    completedIds,
    locale: "en-US",
    onOpen: (item) => {
      selected(item);
      setTarget(item);
    },
  });
  return (
    <>
      <DataGrid
        tooltipShowDelay={650}
        tooltipHideDelay={10000}
        onGridReady={(event) => {
          grid.current = event.api;
        }}
        containerStyle={{ height: 270 }}
        columnDefs={[{ field: "name" }, columns]}
        rowData={[
          { id: "a", name: "Investment Account", nodeType: "account" },
          { id: "group", name: "Group", nodeType: "accountGroup" },
        ]}
        pinnedBottomRowData={[
          {
            id: "footer",
            rowType: "referenceCurrencyTotalFooter",
            name: "Total",
          },
        ]}
      />
      <Drawer
        opened={!!target}
        onClose={() => setTarget(undefined)}
        title="Return Calculation"
        size="90%"
        position="right"
      >
        <ReturnCalculation data={data} />
      </Drawer>
    </>
  );
}
