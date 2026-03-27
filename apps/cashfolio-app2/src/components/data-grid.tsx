import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import { gridTheme } from "./grid-theme";
import { columnTypes } from "./column-types";
import { format } from "date-fns";
import { ensureGridModulesRegistered } from "../ag-grid-modules";

ensureGridModulesRegistered();

export function DataGrid({
  ...props
}: AgGridReactProps & { ref?: React.Ref<AgGridReact> }) {
  return (
    <AgGridReact
      singleClickEdit={true}
      theme={gridTheme}
      columnTypes={columnTypes}
      dataTypeDefinitions={dataTypeDefinitions}
      {...props}
    />
  );
}

const dataTypeDefinitions: AgGridReactProps["dataTypeDefinitions"] = {
  dateString: {
    baseDataType: "dateString",
    extendsDataType: "dateString",

    valueFormatter: ({ value }) => (value ? format(value, "dd.MM.yyyy") : ""),
  },
};
