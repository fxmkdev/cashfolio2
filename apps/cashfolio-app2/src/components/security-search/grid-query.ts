import {
  SECURITY_COLUMNS,
  type SecuritiesFilters,
  type SecuritiesQuery,
  type TextFilter,
} from "@/shared/securities/contracts";

export function gridQuery(request: {
  startRow?: number;
  filterModel?: unknown;
  sortModel: { colId: string; sort: string }[];
}): Pick<SecuritiesQuery, "offset" | "limit" | "filters" | "sorts"> {
  const model = (request.filterModel ?? {}) as Record<
    string,
    { type?: TextFilter["operation"]; filter?: string; values?: string[] }
  >;
  const filters: SecuritiesFilters = {};
  for (const column of ["name", "symbol"] as const) {
    if (model[column])
      filters[column] = {
        operation: model[column].type ?? "contains",
        value: model[column].filter ?? "",
      };
  }
  for (const column of ["exchange", "country", "hasHistory"] as const) {
    if (model[column]) filters[column] = model[column].values ?? [];
  }
  return {
    offset: request.startRow ?? 0,
    limit: 20,
    filters,
    sorts: request.sortModel.flatMap(({ colId, sort }) =>
      SECURITY_COLUMNS.includes(colId as (typeof SECURITY_COLUMNS)[number]) &&
      (sort === "asc" || sort === "desc")
        ? [
            {
              field: colId as (typeof SECURITY_COLUMNS)[number],
              direction: sort,
            },
          ]
        : [],
    ),
  };
}
