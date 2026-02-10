import { type ColDef } from "ag-grid-enterprise";
import type { Route } from "./+types/grid.route";
import { serialize } from "~/serialization";
import { useLoaderData } from "react-router";
import { AccountType, Unit } from "~/.prisma-client/enums";
import { useState } from "react";
import { Badge } from "@mantine/core";
import { DataGrid } from "./data-grid";
import { prisma } from "~/prisma.server";
import { ensureAuthorized } from "~/account-books/functions.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const link = await ensureAuthorized(request, params);

  const type =
    params.type === "assets"
      ? AccountType.ASSET
      : params.type === "liabilities"
        ? AccountType.LIABILITY
        : params.type === "equities"
          ? AccountType.EQUITY
          : undefined;

  const accounts = await prisma.account.findMany({
    where: {
      accountBookId: link.accountBookId,
      isActive: true,
      type,
    },
    orderBy: [{ name: "asc" }],
  });

  const accountGroups = await prisma.accountGroup.findMany({
    where: {
      accountBookId: link.accountBookId,
      isActive: true,
      type,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return serialize({
    data: accounts
      .map((a) => ({
        id: a.id,
        nodeType: "account",
        name: a.name,
        unit: a.unit ?? undefined,
        currency: a.currency ?? undefined,
        cryptocurrency: a.cryptocurrency ?? undefined,
        symbol: a.symbol ?? undefined,
        tradeCurrency: a.tradeCurrency ?? undefined,
        parentId: a.groupId as string | undefined,
        isActive: a.isActive,
      }))
      .concat(
        accountGroups
          .filter((ag) => !!ag.parentGroupId)
          .map((ag) => ({
            id: ag.id,
            nodeType: "accountGroup",
            name: ag.name,
            unit: undefined,
            currency: undefined,
            cryptocurrency: undefined,
            symbol: undefined,
            tradeCurrency: undefined,
            parentId: ag.parentGroupId ?? undefined,
            isActive: ag.isActive,
          })),
      ),
  });
}

export default function GridRoute() {
  const { data } = useLoaderData<typeof loader>();

  const [columnDefs] = useState<ColDef<(typeof data)[number]>[]>([
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
      containerStyle={{
        height: `calc(100vh - 10rem)`,
      }}
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
      excludeChildrenWhenTreeDataFiltering={true}
    />
  );
}
