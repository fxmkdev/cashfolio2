import { Select, TextInput } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import type { SuppressKeyboardEventParams } from "ag-grid-enterprise";
import {
  type AgGridReactProps,
  type CustomCellEditorProps,
} from "ag-grid-react";
import { parse } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { numericFormatter } from "react-number-format";
import {
  FormattedNumberInput,
  getNumberFormatSymbols,
} from "./formatted-number-input";

export const FORMATTED_NUMERIC_COLUMN = "formattedNumericColumn";
export const SELECT_COLUMN = "selectColumn";
export const TEXT_COLUMN = "textColumn";
export const DATE_COLUMN = "dateColumn";

const exactTooltipNumberFormatter = new Intl.NumberFormat("en-CH", {
  maximumFractionDigits: 20,
});

export type ExactValueByField = Record<string, number | null | undefined>;

type RowWithExactValues = {
  __exactByField?: ExactValueByField;
};

function getColumnExactValueFieldKey(colDef: {
  colId?: unknown;
  field?: unknown;
}): string | null {
  if (typeof colDef.colId === "string" && colDef.colId.length > 0) {
    return colDef.colId;
  }

  if (typeof colDef.field === "string" && colDef.field.length > 0) {
    return colDef.field;
  }

  return null;
}

function toFiniteTooltipValue(value: unknown): number | null {
  if (typeof value !== "number") {
    return null;
  }

  return Number.isFinite(value) ? value : null;
}

export function formatExactNumericTooltipValue(value: number): string {
  return exactTooltipNumberFormatter.format(value);
}

export function resolveFormattedNumericTooltipLabel(args: {
  colDef: {
    colId?: unknown;
    field?: unknown;
  };
  value: unknown;
  data: RowWithExactValues | undefined;
}): string | null {
  const key = getColumnExactValueFieldKey(args.colDef);

  if (key && args.data?.__exactByField && key in args.data.__exactByField) {
    const exactValue = toFiniteTooltipValue(args.data.__exactByField[key]);
    return exactValue != null
      ? formatExactNumericTooltipValue(exactValue)
      : null;
  }

  const rawValue = toFiniteTooltipValue(args.value);
  if (rawValue == null) {
    return null;
  }

  return formatExactNumericTooltipValue(rawValue);
}

export const columnTypes: AgGridReactProps["columnTypes"] = {
  [FORMATTED_NUMERIC_COLUMN]: {
    headerClass: "ag-right-aligned-header",
    cellClass: "ag-right-aligned-cell",
    valueFormatter: ({ value }) => {
      const { decimalSeparator, thousandSeparator } =
        getNumberFormatSymbols("en-CH");
      return value != null
        ? numericFormatter(value.toString(), {
            thousandSeparator,
            decimalSeparator,
            decimalScale: 2,
            fixedDecimalScale: true,
          })
        : "";
    },
    tooltipValueGetter: ({ colDef, value, data }) =>
      resolveFormattedNumericTooltipLabel({
        colDef: (colDef ?? {}) as {
          colId?: unknown;
          field?: unknown;
        },
        value,
        data: (data as RowWithExactValues | undefined) ?? undefined,
      }) ?? undefined,
    cellEditor: ({ value, onValueChange }: CustomCellEditorProps) => {
      const ref = useRef<HTMLInputElement>(null);
      useEffect(() => {
        ref.current?.select();
      }, []);
      return (
        <FormattedNumberInput
          ref={ref}
          hideControls
          variant="unstyled"
          px={12}
          locale="en-CH"
          value={value}
          onValueChange={({ floatValue }) => onValueChange(floatValue)}
        />
      );
    },
  },
  [SELECT_COLUMN]: {
    valueFormatter: ({ value, colDef }) =>
      (colDef.context?.options ?? []).find(
        (o: { label: string; value: string }) => o.value === value,
      )?.label ?? "",
    cellEditor: ({
      colDef,
      options: paramsOptions,
      searchable,
      value,
      onValueChange,
    }: CustomCellEditorProps & {
      searchable?: boolean;
      options?: { label: string; value: string }[];
    }) => {
      const options = paramsOptions ?? colDef.context?.options ?? [];
      const ref = useRef<HTMLInputElement>(null);
      useEffect(() => {
        ref.current?.select();
      }, []);

      const [isDropdownOpen, setIsDropdownOpen] = useState(false);

      useEffect(() => {
        function handleSuppressKeyboardEvent(
          params: SuppressKeyboardEventParams,
        ) {
          return params.event.key === "Enter";
        }

        colDef.suppressKeyboardEvent = isDropdownOpen
          ? handleSuppressKeyboardEvent
          : undefined;
      }, [isDropdownOpen]);
      return (
        <Select
          ref={ref}
          variant="unstyled"
          pl={12}
          selectFirstOptionOnChange
          searchable={searchable ?? true}
          withAlignedLabels
          data={options}
          onDropdownOpen={() => setIsDropdownOpen(true)}
          onDropdownClose={() => setIsDropdownOpen(false)}
          value={value}
          onChange={(v) => onValueChange(v)}
        />
      );
    },
  },
  [TEXT_COLUMN]: {
    cellEditor: ({ value, onValueChange }: CustomCellEditorProps) => {
      const ref = useRef<HTMLInputElement>(null);
      useEffect(() => {
        ref.current?.select();
      }, []);
      return (
        <TextInput
          ref={ref}
          variant="unstyled"
          px={12}
          value={value}
          onChange={(e) => onValueChange(e.currentTarget.value)}
        />
      );
    },
  },
  [DATE_COLUMN]: {
    headerClass: "ag-right-aligned-header",
    cellClass: "ag-right-aligned-cell",
    cellEditor: ({
      value,
      onValueChange,
      startDate,
    }: CustomCellEditorProps & {
      startDate?: string | Date;
    }) => {
      const ref = useRef<HTMLInputElement>(null);
      useEffect(() => {
        ref.current?.select();
      }, []);
      return (
        <DateInput
          ref={ref}
          variant="unstyled"
          px={12}
          valueFormat="DD.MM.YYYY"
          dateParser={(value) => parse(value, "dd.MM.yyyy", new Date())}
          minDate={startDate}
          value={value}
          onChange={(v) => onValueChange(v)}
        />
      );
    },
  },
};
