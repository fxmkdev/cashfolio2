import { Loader } from "@mantine/core";
import type { ColGroupDef, ICellRendererParams } from "ag-grid-enterprise";
import { FORMATTED_NUMERIC_COLUMN } from "@/components/grid/column-types";
import type {
  AccountGainLossSummaries,
  AccountGainLossSummary,
} from "@/shared/account-gain-loss";
import { getCurrencyDecimals } from "@/shared/unit-format";
import type { AccountsGridRow } from "../grid/rows";
import { isReferenceCurrencyTotalFooterRow } from "../grid/rows";
import { AccountGainLossHeader } from "./header";

import type { ColDef } from "ag-grid-enterprise";
type GainLossColumnOptions = {
  referenceCurrency: string;
  data?: AccountGainLossSummaries;
  loading: boolean;
};
type GainLossResult = AccountGainLossSummaries["total"];
type ResultFor = (
  row: AccountsGridRow | undefined,
) => GainLossResult | undefined;
type GainLossField = { field: keyof AccountGainLossSummary; label: string };
const fields: GainLossField[] = [
  { field: "totalGainLoss", label: "Total" },
  { field: "realizedGainLoss", label: "Realised" },
  { field: "unrealizedGainLoss", label: "Unrealised" },
];
const gainLossHeaderKeyboard: NonNullable<
  ColGroupDef<AccountsGridRow>["suppressHeaderKeyboardEvent"]
> = ({ event }) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  const header = target.closest<HTMLElement>('[role="columnheader"]');
  const button = header?.querySelector<HTMLButtonElement>("button");
  if (!button) return false;
  if (event.key === "Tab") {
    if (target === header && !event.shiftKey) {
      event.preventDefault();
      button.focus();
      return true;
    }
    if (target === button && event.shiftKey) {
      event.preventDefault();
      header?.focus();
      return true;
    }
  }
  return target === button && ["Enter", " ", "Escape"].includes(event.key);
};

function gainLossTooltip(
  result: GainLossResult | undefined,
  field: keyof AccountGainLossSummary,
) {
  return !result
    ? "Gain/loss is unavailable."
    : !result.applicable
      ? "Holding G/L does not apply."
      : result.summary[field] == null
        ? [...new Set(result.diagnostics.map((item) => item.message))].join(" ")
        : "Calculated holding G/L plus recorded adjustments since account-book start. Realised includes recorded adjustments.";
}
function renderGainLoss(
  loading: boolean,
  result: GainLossResult | undefined,
  field: keyof AccountGainLossSummary,
  valueFormatted: string | null | undefined,
) {
  return loading ? (
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
  ) : result?.summary[field] == null ? (
    "—"
  ) : (
    valueFormatted
  );
}
function buildGainLossChild(
  args: GainLossColumnOptions,
  resultFor: ResultFor,
  { field, label }: GainLossField,
): ColDef<AccountsGridRow> {
  return {
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
    tooltipValueGetter: ({ data }) => gainLossTooltip(resultFor(data), field),
    cellRenderer: ({
      data,
      valueFormatted,
    }: ICellRendererParams<AccountsGridRow>) =>
      renderGainLoss(args.loading, resultFor(data), field, valueFormatted),
  };
}
export function buildAccountGainLossColumns(
  args: GainLossColumnOptions,
): ColGroupDef<AccountsGridRow> {
  const byId = new Map(args.data?.rows.map((row) => [row.id, row]));
  const resultFor: ResultFor = (data) =>
    data
      ? isReferenceCurrencyTotalFooterRow(data)
        ? args.data?.total
        : byId.get(data.id)
      : undefined;
  return {
    groupId: "holding-gain-loss",
    headerName: `G/L Since Start (${args.referenceCurrency})`,
    headerGroupComponentParams: {
      innerHeaderGroupComponent: AccountGainLossHeader,
    },
    suppressHeaderKeyboardEvent: gainLossHeaderKeyboard,
    marryChildren: true,
    children: fields.map((field) => buildGainLossChild(args, resultFor, field)),
  };
}
