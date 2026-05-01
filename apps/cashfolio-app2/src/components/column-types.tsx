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
import { Unit } from "../.prisma-client/enums";
import { getUnitDisplayDecimals } from "../shared/unit-format";
import {
  FormattedNumberInput,
  getNumberFormatSymbols,
} from "./formatted-number-input";

export const FORMATTED_NUMERIC_COLUMN = "formattedNumericColumn";
export const SELECT_COLUMN = "selectColumn";
export const TEXT_COLUMN = "textColumn";
export const DATE_COLUMN = "dateColumn";

type FormattedNumericMode = "display" | "entry";

type FormattedNumericColDefConfig = {
  formattedNumericMode?: FormattedNumericMode;
  getDisplayDecimals?: (params: {
    data: unknown;
    value: number | null | undefined;
  }) => number;
};

function getFormattedNumericConfig(
  colDef: unknown,
): FormattedNumericColDefConfig {
  if (typeof colDef !== "object" || colDef === null) {
    return {};
  }

  const context = (colDef as { context?: unknown }).context;
  if (typeof context !== "object" || context === null) {
    return {};
  }

  return ((context as { formattedNumeric?: FormattedNumericColDefConfig })
    .formattedNumeric ?? {}) as FormattedNumericColDefConfig;
}

function getDefaultDisplayDecimals(data: unknown): number {
  if (
    typeof data === "object" &&
    data !== null &&
    "unit" in data &&
    (data as { unit?: unknown }).unit != null
  ) {
    const row = data as {
      unit: Unit;
      currency?: string | null;
      cryptocurrency?: string | null;
    };
    return getUnitDisplayDecimals({
      unit: row.unit,
      currency: row.currency,
      cryptocurrency: row.cryptocurrency,
    });
  }

  return 2;
}

export const columnTypes: AgGridReactProps["columnTypes"] = {
  [FORMATTED_NUMERIC_COLUMN]: {
    headerClass: "ag-right-aligned-header",
    cellClass: "ag-right-aligned-cell",
    valueFormatter: ({ value, data, colDef }) => {
      const { decimalSeparator, thousandSeparator } =
        getNumberFormatSymbols("en-CH");
      if (value == null) {
        return "";
      }

      const config = getFormattedNumericConfig(colDef);
      const mode = config.formattedNumericMode ?? "display";
      if (mode === "entry") {
        return numericFormatter(value.toString(), {
          thousandSeparator,
          decimalSeparator,
        });
      }

      const decimals =
        config.getDisplayDecimals?.({
          data,
          value: typeof value === "number" ? value : Number(value),
        }) ?? getDefaultDisplayDecimals(data);

      return numericFormatter(value.toString(), {
        thousandSeparator,
        decimalSeparator,
        decimalScale: decimals,
        fixedDecimalScale: true,
      });
    },
    cellEditor: ({
      value,
      onValueChange,
      data,
      colDef,
    }: CustomCellEditorProps) => {
      const ref = useRef<HTMLInputElement>(null);
      useEffect(() => {
        ref.current?.select();
      }, []);

      const config = getFormattedNumericConfig(colDef);
      const mode = config.formattedNumericMode ?? "display";
      const decimals =
        config.getDisplayDecimals?.({
          data,
          value: typeof value === "number" ? value : Number(value),
        }) ?? getDefaultDisplayDecimals(data);

      return (
        <FormattedNumberInput
          ref={ref}
          hideControls
          variant="unstyled"
          px={12}
          locale="en-CH"
          decimalScale={mode === "display" ? decimals : undefined}
          fixedDecimalScale={false}
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
