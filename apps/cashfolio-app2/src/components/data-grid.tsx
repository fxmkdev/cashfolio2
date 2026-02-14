import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import { gridTheme } from "./grid-theme";

export function DataGrid(props: AgGridReactProps) {
  return <AgGridReact theme={gridTheme} {...props} />;
}
