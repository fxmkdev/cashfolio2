import { DataGrid } from "@/components/grid/data-grid";
import { postSortAccountRows } from "./-archived-grid-rows";
import {
  AccountNameCell,
  suppressAccountNameKeyboardEvent,
} from "./-account-name-cell";
import { AccountGainLossDetails } from "./-gain-loss-header";
import type { AccountsPageViewProps } from "./-page-view-types";
export function AccountsPageGrid({
  managementContext = "accounts",
  gainLoss,
  bulkAccountActions,
  rows,
  columnDefs,
  pinnedBottomRowData,
  onGridReady,
  isGroupOpenByDefault,
  onRowGroupOpened,
  onOpenLedger,
}: Pick<
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
>) {
  const isCategories = managementContext === "categories";
  return (
    <AccountGainLossDetails
      data={gainLoss?.data}
      loading={gainLoss?.loading ?? false}
    >
      <DataGrid
        {...bulkAccountActions?.gridProps}
        containerStyle={{ flex: 1, minHeight: 0 }}
        rowData={rows}
        columnDefs={columnDefs}
        autoGroupColumnDef={{
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
        }}
        postSortRows={postSortAccountRows}
        treeData={true}
        treeDataParentIdField="parentId"
        pinnedBottomRowData={pinnedBottomRowData}
        onGridReady={(event) => {
          onGridReady?.(event);
          bulkAccountActions?.gridProps.onGridReady?.(event);
        }}
        isGroupOpenByDefault={isGroupOpenByDefault}
        onRowGroupOpened={onRowGroupOpened}
        getRowId={({ data }) => data.id}
        onRowDoubleClicked={(e) => {
          if (e.data?.nodeType === "account") {
            onOpenLedger(e.data.id);
          }
        }}
      />
    </AccountGainLossDetails>
  );
}
