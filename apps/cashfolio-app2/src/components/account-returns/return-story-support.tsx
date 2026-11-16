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
import { buildAccountReturnColumn } from "@/components/account-management/returns/columns";
import { ReturnCalculation } from "./return-calculation";

export const data: AccountReturnDetails = {
  applicable: true,

  mwr: 0.21,

  annualizedMwr: 0.1,
  effectiveStartDate: "2025-01-01",
  effectiveEndDate: "2026-12-31",
  diagnostics: [],
  startDate: "2025-01-01",
  asOfDate: "2026-12-31",
  referenceCurrency: "CHF",
  name: "Investments",
  valuations: [
    { id: "opening", date: "2024-12-31", kind: "opening", value: 1000 },
    { id: "year", date: "2025-12-31", kind: "intermediate", value: 1100 },
    { id: "closing", date: "2026-12-31", kind: "closing", value: 2310 },
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
      columns: ["account-return"],
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
              mwr: null,

              annualizedMwr: null,
              diagnostics: [
                {
                  message:
                    "Return is unavailable because a closing valuation is missing.",
                },
              ],
            }
          : {}),
      },
      { id: "group", ...data },
    ],
    total: data,
  };
  const columns = buildAccountReturnColumn({
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
