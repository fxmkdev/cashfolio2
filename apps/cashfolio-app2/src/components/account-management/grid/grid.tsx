import { DataGrid } from "@/components/grid/data-grid";
import { useMemo } from "react";
import { postSortAccountRows } from "./archived-rows";
import { AccountNameCell, suppressAccountNameKeyboardEvent } from "./name-cell";
import { AccountGainLossDetails } from "../gain-loss/header";
import type { AccountsPageViewProps } from "../view-types";

import type { ColDef, SetFilterHandler } from "ag-grid-enterprise";
import type { AgGridReactProps } from "ag-grid-react";
import type { AccountsGridRow } from "./rows";
type PageGridProps = Pick<
  AccountsPageViewProps,
  | "managementContext"
  | "gainLoss"
  | "bulkAccountActions"
  | "rows"
  | "columnDefs"
  | "pinnedBottomRowData"
  | "onGridReady"
  | "isGroupOpenByDefault"
  | "onRowGroupOpened"
  | "onOpenLedger"
>;
type GridEvents = Pick<
  AgGridReactProps<AccountsGridRow>,
  "onGridReady" | "onRowDoubleClicked" | "onRowDataUpdated"
>;
function accountNameColumn(isCategories: boolean): ColDef<AccountsGridRow> {
  return {
    headerName: "Name",
    field: "name",
    pinned: isCategories ? null : "left",
    flex: isCategories ? 1 : 0,
    initialWidth: 320,
    minWidth: 320,
    resizable: true,
    filter: "agTextColumnFilter",
    valueGetter: ({ data }) => data?.name,
    tooltipValueGetter: ({ data }) => data?.name,
    suppressKeyboardEvent: suppressAccountNameKeyboardEvent,
    cellRendererParams: {
      suppressCount: true,
      innerRenderer: AccountNameCell,
    },
  };
}
function accountGridEvents({
  onGridReady,
  bulkAccountActions,
  onOpenLedger,
}: Pick<
  PageGridProps,
  "onGridReady" | "bulkAccountActions" | "onOpenLedger"
>): GridEvents {
  return {
    onGridReady: (event) => {
      onGridReady?.(event);
      bulkAccountActions?.gridProps.onGridReady?.(event);
    },
    onRowDataUpdated: (event) => {
      for (const id of [
        "unitIdentifier",
        "assetClass",
        "path",
        "trackingMethod",
      ]) {
        if (event.api.getColumn(id))
          event.api
            .getColumnFilterHandler<SetFilterHandler>(id)
            ?.refreshFilterValues();
      }
      bulkAccountActions?.gridProps.onRowDataUpdated?.(event);
    },
    onRowDoubleClicked: (event) => {
      if (event.isEventHandlingSuppressed) return;
      if (
        event.data &&
        "nodeType" in event.data &&
        event.data.nodeType === "account"
      )
        onOpenLedger(event.data.id);
    },
  };
}
export function AccountsPageGrid(props: PageGridProps) {
  const nameColumn = useMemo(
    () => accountNameColumn(props.managementContext === "categories"),
    [props.managementContext],
  );
  return (
    <AccountGainLossDetails
      data={props.gainLoss?.data}
      loading={props.gainLoss?.loading ?? false}
    >
      <DataGrid
        {...props.bulkAccountActions?.gridProps}
        containerStyle={{ flex: 1, minHeight: 0 }}
        rowData={props.rows}
        columnDefs={props.columnDefs}
        autoGroupColumnDef={nameColumn}
        postSortRows={postSortAccountRows}
        treeData
        treeDataParentIdField="parentId"
        pinnedBottomRowData={props.pinnedBottomRowData}
        {...accountGridEvents(props)}
        isGroupOpenByDefault={props.isGroupOpenByDefault}
        onRowGroupOpened={props.onRowGroupOpened}
        getRowId={({ data }) => data.id}
      />
    </AccountGainLossDetails>
  );
}
