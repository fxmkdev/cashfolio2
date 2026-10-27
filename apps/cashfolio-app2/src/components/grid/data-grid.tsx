import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import { gridTheme } from "./grid-theme";
import { columnTypes } from "./column-types";
import { ensureGridModulesRegistered } from "../../ag-grid-modules";
import { formatUtcDateForLocale } from "@/shared/date";
import { useUserLocale } from "@/user-locale-context";
import { useMemo } from "react";
import { getGridUserLocale, GRID_UI_TEXT } from "./grid-locale";

ensureGridModulesRegistered();

export function DataGrid({
  context,
  localeText,
  ...props
}: AgGridReactProps & { ref?: React.Ref<AgGridReact> }) {
  const userLocale = useUserLocale();
  const resolvedContext = useMemo(
    () => ({ ...context, userLocale }),
    [context, userLocale],
  );
  const resolvedLocaleText = useMemo(
    () => ({ ...GRID_UI_TEXT, ...localeText }),
    [localeText],
  );

  return (
    <AgGridReact
      singleClickEdit={true}
      theme={gridTheme}
      columnTypes={columnTypes}
      dataTypeDefinitions={dataTypeDefinitions}
      context={resolvedContext}
      localeText={resolvedLocaleText}
      {...props}
    />
  );
}

export const dataTypeDefinitions: AgGridReactProps["dataTypeDefinitions"] = {
  dateString: {
    baseDataType: "dateString",
    extendsDataType: "dateString",

    valueFormatter: ({ context, value }) =>
      value
        ? formatUtcDateForLocale(new Date(value), getGridUserLocale(context))
        : "",
  },
};
