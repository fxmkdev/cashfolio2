import { AgGridReact, type AgGridReactProps } from "ag-grid-react";
import { gridTheme } from "./grid-theme";
import { gridIcons } from "./grid-icons";
import { columnTypes } from "./column-types";
import { ensureGridModulesRegistered } from "../../ag-grid-modules";
import { formatUtcDateForLocale } from "@/shared/date";
import { useUserLocale } from "@/user-locale-context";
import { useMemo } from "react";
import { getGridUserLocale, GRID_UI_TEXT } from "./grid-locale";

ensureGridModulesRegistered();

export function DataGrid({
  context,
  icons,
  localeText,
  ...props
}: AgGridReactProps & { ref?: React.Ref<AgGridReact> }) {
  const userLocale = useUserLocale();
  const resolvedContext = useMemo(
    () => ({ ...context, userLocale }),
    [context, userLocale],
  );
  const resolvedIcons = useMemo(() => ({ ...gridIcons, ...icons }), [icons]);
  const resolvedLocaleText = useMemo(
    () => ({ ...GRID_UI_TEXT, ...localeText }),
    [localeText],
  );

  return (
    <AgGridReact
      singleClickEdit={true}
      theme={gridTheme}
      icons={resolvedIcons}
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
