import { type ColDef } from "ag-grid-enterprise";
import type { Route } from "./+types/grid.route";
import { serialize } from "~/serialization";
import { useLoaderData } from "react-router";
import { Unit } from "~/.prisma-client/enums";
import { useState } from "react";
import { Badge } from "@mantine/core";
import { DataGrid } from "./data-grid";

export const mockData: {
  id: string;
  nodeType: "accountGroup" | "account";
  name: string;
  unit?: Unit;
  currency?: string;
  symbol?: string;
  tradeCurrency?: string;
  cryptocurrency?: string;
  parentId?: string;
  isActive: boolean;
}[] = [
  { id: "A", nodeType: "accountGroup", name: "Cash", isActive: true },
  {
    id: "B",
    nodeType: "account",
    name: "neon",
    unit: Unit.CURRENCY,
    currency: "CHF",
    parentId: "A",
    isActive: true,
  },
  {
    id: "C",
    nodeType: "account",
    name: "Julius Bär",
    unit: Unit.CURRENCY,
    currency: "CHF",
    parentId: "A",
    isActive: true,
  },
  {
    id: "C2",
    nodeType: "account",
    name: "DKB",
    unit: Unit.CURRENCY,
    currency: "EUR",
    parentId: "A",
    isActive: true,
  },
  {
    id: "C3",
    nodeType: "account",
    name: "PostFinance",
    unit: Unit.CURRENCY,
    currency: "CHF",
    parentId: "A",
    isActive: false,
  },
  { id: "D", nodeType: "accountGroup", name: "Stocks", isActive: true },
  {
    id: "E",
    nodeType: "accountGroup",
    name: "Julius Bär",
    parentId: "D",
    isActive: true,
  },
  {
    id: "F",
    nodeType: "account",
    name: "Vanguard All-World UCITS ETF",
    unit: Unit.SECURITY,
    symbol: "FWRA.L",
    tradeCurrency: "USD",
    parentId: "E",
    isActive: true,
  },
];

export function loader({ params }: Route.LoaderArgs) {
  return serialize({
    data: mockData,
  });
}

export default function GridRoute() {
  const { data } = useLoaderData<typeof loader>();

  const [columnDefs] = useState<ColDef<(typeof mockData)[number]>[]>([
    {
      colId: "currency",
      headerName: "Ccy.",
      filter: true,
      width: 100,
      valueGetter: ({ data }) => {
        if (!data?.unit) return undefined;
        switch (data.unit) {
          case Unit.CURRENCY:
            return data.currency;
          case Unit.SECURITY:
            return data.tradeCurrency;
          case Unit.CRYPTOCURRENCY:
            return data.cryptocurrency;
        }
      },
    },
    {
      field: "symbol",
      filter: true,
      width: 120,
    },
    {
      field: "isActive",
      headerName: "",
      filter: true,
      width: 150,
      cellRenderer: ({ value }: { value: boolean }) =>
        value ? (
          <></>
        ) : (
          <Badge size="sm" variant="outline" color="gray">
            Inactive
          </Badge>
        ),
    },
  ]);

  return (
    <DataGrid
      domLayout="autoHeight"
      rowData={data}
      columnDefs={columnDefs}
      autoGroupColumnDef={{
        headerName: "Name",
        field: "name",
        rowDrag: true,
        flex: 1,
        cellRendererParams: {
          suppressCount: true,
        },
      }}
      rowDragManaged={true}
      treeData={true}
      treeDataParentIdField="parentId"
      getRowId={({ data }) => data.id}
      groupDefaultExpanded={-1}
      excludeChildrenWhenTreeDataFiltering={true}
      onGridReady={(e) => {
        e.api.setColumnFilterModel("isActive", {
          filterType: "set",
          values: ["true"],
        });
        e.api.onFilterChanged();
      }}
    />
  );
}
