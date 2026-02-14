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
      colDef.context.options.find(
        (o: { label: string; value: string }) => o.value === value,
      )?.label ?? "",
    cellEditor: ({
      colDef,
      searchable,
      value,
      onValueChange,
    }: CustomCellEditorProps & {
      searchable?: boolean;
    }) => {
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
          data={colDef.context.options}
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
