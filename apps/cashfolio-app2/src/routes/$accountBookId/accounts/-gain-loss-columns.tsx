import { Loader } from "@mantine/core";
import type { ColGroupDef, ICellRendererParams } from "ag-grid-enterprise";
import { FORMATTED_NUMERIC_COLUMN } from "@/components/grid/column-types";
import type {
  AccountGainLossSummaries,
  AccountGainLossSummary,
} from "@/shared/account-gain-loss";
import { getCurrencyDecimals } from "@/shared/unit-format";
import type { AccountsGridRow } from "./-page-types";
import { isReferenceCurrencyTotalFooterRow } from "./-page-types";

export function buildAccountGainLossColumns(args: {
  referenceCurrency: string;
  data?: AccountGainLossSummaries;
  loading: boolean;
}): ColGroupDef<AccountsGridRow> {
  const byId = new Map(args.data?.rows.map((row) => [row.id, row]));
  const resultFor = (data: AccountsGridRow | undefined) =>
    data
      ? isReferenceCurrencyTotalFooterRow(data)
        ? args.data?.total
        : byId.get(data.id)
      : undefined;
  const fields: { field: keyof AccountGainLossSummary; label: string }[] = [
    { field: "totalGainLoss", label: "Total" },
    { field: "realizedGainLoss", label: "Realised" },
    { field: "unrealizedGainLoss", label: "Unrealised" },
  ];
  return {
    headerName: `G/L Since Start (${args.referenceCurrency})`,
    marryChildren: true,
    children: fields.map(({ field, label }) => ({
      colId: field,
      headerName: label,
      width: 140,
      type: FORMATTED_NUMERIC_COLUMN,
      filter: "agNumberColumnFilter",
      context: {
        formattedNumeric: {
          getDisplayDecimals: () => getCurrencyDecimals(args.referenceCurrency),
        },
      },
      valueGetter: ({ data }) => resultFor(data)?.summary[field] ?? null,
      cellStyle: ({ value }) => ({
        color:
          value == null || value === 0
            ? "inherit"
            : value > 0
              ? "var(--mantine-color-green-6)"
              : "var(--mantine-color-red-6)",
      }),
      tooltipValueGetter: ({ data }) => {
        const result = resultFor(data);
        return !result
          ? "Gain/loss is unavailable."
          : !result.applicable
            ? "Holding G/L does not apply."
            : result.summary[field] == null
              ? [
                  ...new Set(result.diagnostics.map((item) => item.message)),
                ].join(" ")
              : "Calculated holding G/L since account-book start; excludes explicit G/L bookings.";
      },
      cellRenderer: ({
        data,
        valueFormatted,
      }: ICellRendererParams<AccountsGridRow>) =>
        args.loading ? (
          <div
            style={{
              display: "flex",
              height: "100%",
              justifyContent: "flex-end",
              alignItems: "center",
            }}
          >
            <Loader size="xs" type="dots" />
          </div>
        ) : resultFor(data)?.summary[field] == null ? (
          "—"
        ) : (
          valueFormatted
        ),
    })),
  };
}
