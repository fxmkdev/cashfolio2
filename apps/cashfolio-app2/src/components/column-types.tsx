import { Select, TextInput } from "@mantine/core";
import type { SelectProps } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import type { SuppressKeyboardEventParams } from "ag-grid-enterprise";
import {
  type AgGridReactProps,
  type CustomCellEditorProps,
} from "ag-grid-react";
import { useEffect, useRef, useState } from "react";
import { numericFormatter } from "react-number-format";
import { Unit } from "../.prisma-client/enums";
import {
  getDateInputValueFormat,
  normalizeDateInputValue,
} from "../shared/date";
import { getUnitDisplayDecimals } from "../shared/unit-format";
import { AccountTreeSelect } from "./account-tree-select";
import {
  FormattedNumberInput,
  getNumberFormatSymbols,
} from "./formatted-number-input";
import { getGridUserLocale } from "./grid-locale";

export const FORMATTED_NUMERIC_COLUMN = "formattedNumericColumn";
export const SELECT_COLUMN = "selectColumn";
export const ACCOUNT_TREE_SELECT_COLUMN = "accountTreeSelectColumn";
export const TEXT_COLUMN = "textColumn";
export const DATE_COLUMN = "dateColumn";

type FormattedNumericMode = "display" | "entry";
type SelectColumnOptions = NonNullable<SelectProps["data"]>;
type SelectColumnOption = { label: string; value: string };
type SelectColumnGroup = { group: string; items: SelectColumnOption[] };

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

function isSelectColumnOption(value: unknown): value is SelectColumnOption {
  return (
    typeof value === "object" &&
    value !== null &&
    "value" in value &&
    "label" in value
  );
}

function isSelectColumnGroup(value: unknown): value is SelectColumnGroup {
  return (
    typeof value === "object" &&
    value !== null &&
    "items" in value &&
    Array.isArray((value as { items?: unknown }).items)
  );
}

function findSelectOptionLabel(
  options: SelectColumnOptions,
  value: unknown,
): string {
  for (const option of options) {
    if (typeof option === "string") {
      if (option === value) return option;
      continue;
    }

    if (isSelectColumnGroup(option)) {
      const label = findSelectOptionLabel(option.items, value);
      if (label) return label;
      continue;
    }

    if (isSelectColumnOption(option) && option.value === value) {
      return option.label;
    }
  }

  return "";
}

function FormattedNumericCellEditor({
  value,
  onValueChange,
  data,
  colDef,
  context,
}: CustomCellEditorProps) {
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
      locale={getGridUserLocale(context)}
      decimalScale={mode === "display" ? decimals : undefined}
      fixedDecimalScale={false}
      value={value}
      onValueChange={({ floatValue }) => onValueChange(floatValue)}
    />
  );
}

function SelectCellEditor({
  colDef,
  options: paramsOptions,
  searchable,
  value,
  onValueChange,
}: CustomCellEditorProps & {
  searchable?: boolean;
  options?: SelectColumnOptions;
}) {
  const options = paramsOptions ?? colDef.context?.options ?? [];
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    function handleSuppressKeyboardEvent(params: SuppressKeyboardEventParams) {
      return params.event.key === "Enter";
    }

    colDef.suppressKeyboardEvent = isDropdownOpen
      ? handleSuppressKeyboardEvent
      : undefined;
  }, [colDef, isDropdownOpen]);

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
      onChange={(nextValue) => onValueChange(nextValue)}
    />
  );
}

function AccountTreeSelectCellEditor({
  colDef,
  value,
  onValueChange,
}: CustomCellEditorProps) {
  const options = colDef.context?.options ?? [];
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    function handleSuppressKeyboardEvent(params: SuppressKeyboardEventParams) {
      return params.event.key === "Enter";
    }

    colDef.suppressKeyboardEvent = isDropdownOpen
      ? handleSuppressKeyboardEvent
      : undefined;
  }, [colDef, isDropdownOpen]);

  return (
    <AccountTreeSelect
      ref={ref}
      variant="unstyled"
      pl={12}
      accounts={options}
      onDropdownOpen={() => setIsDropdownOpen(true)}
      onDropdownClose={() => setIsDropdownOpen(false)}
      value={value ?? null}
      onChange={(nextValue) => onValueChange(nextValue)}
    />
  );
}

function TextCellEditor({ value, onValueChange }: CustomCellEditorProps) {
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
      onChange={(event) => onValueChange(event.currentTarget.value)}
    />
  );
}

function DateCellEditor({
  value,
  onValueChange,
  startDate,
  context,
}: CustomCellEditorProps & {
  startDate?: string | Date;
  context?: unknown;
}) {
  const locale = getGridUserLocale(context);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.select();
  }, []);

  return (
    <DateInput
      ref={ref}
      variant="unstyled"
      px={12}
      valueFormat={getDateInputValueFormat(locale)}
      dateParser={(nextValue) => normalizeDateInputValue(nextValue, locale)}
      minDate={startDate}
      value={value}
      onChange={(nextValue) => onValueChange(nextValue)}
    />
  );
}

export const columnTypes: AgGridReactProps["columnTypes"] = {
  [FORMATTED_NUMERIC_COLUMN]: {
    headerClass: "ag-right-aligned-header",
    cellClass: "ag-right-aligned-cell",
    valueFormatter: ({ value, data, colDef, context }) => {
      const { decimalSeparator, thousandSeparator } = getNumberFormatSymbols(
        getGridUserLocale(context),
      );
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
    cellEditor: FormattedNumericCellEditor,
  },
  [SELECT_COLUMN]: {
    valueFormatter: ({ value, colDef }) =>
      findSelectOptionLabel(colDef.context?.options ?? [], value),
    cellEditor: SelectCellEditor,
  },
  [ACCOUNT_TREE_SELECT_COLUMN]: {
    valueFormatter: ({ value, colDef }) =>
      (colDef.context?.options ?? []).find(
        (o: { label: string; value: string }) => o.value === value,
      )?.label ?? "",
    cellEditor: AccountTreeSelectCellEditor,
  },
  [TEXT_COLUMN]: {
    cellEditor: TextCellEditor,
  },
  [DATE_COLUMN]: {
    headerClass: "ag-right-aligned-header",
    cellClass: "ag-right-aligned-cell",
    cellEditor: DateCellEditor,
  },
};
