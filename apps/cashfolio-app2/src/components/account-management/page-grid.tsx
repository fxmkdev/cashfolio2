import { DataGrid } from "@/components/grid/data-grid";
import { postSortAccountRows } from "./archived-grid-rows";
import {
  AccountNameCell,
  suppressAccountNameKeyboardEvent,
} from "./account-name-cell";
import { AccountGainLossDetails } from "./gain-loss-header";
import type { AccountsPageViewProps } from "./page-view-types";

import type { ColDef } from "ag-grid-enterprise";
import type { AgGridReactProps } from "ag-grid-react";
import type { AccountsGridRow } from "./page-types";
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
  "onGridReady" | "onRowDoubleClicked"
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
        autoGroupColumnDef={accountNameColumn(
          props.managementContext === "categories",
        )}
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
