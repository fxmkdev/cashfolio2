import type { CellClassParams, ColDef } from "ag-grid-enterprise";
import { useRef } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Input,
  Space,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { Unit } from "~/.prisma-client/enums";
import {
  IconCheck,
  IconInfoCircle,
  IconTablePlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import {
  DATE_COLUMN,
  FORMATTED_NUMERIC_COLUMN,
  SELECT_COLUMN,
  TEXT_COLUMN,
} from "./column-types";
import { DataGrid } from "./data-grid";
import type { AgGridReact, CustomCellRendererProps } from "ag-grid-react";
import { createId } from "@paralleldrive/cuid2";
import { sum } from "~/utils";
import { numericFormatter } from "react-number-format";
import { getNumberFormatSymbols } from "~/platform/forms/formatted-number-input";
import { DateInput } from "@mantine/dates";
import { formRootRule, isNotEmpty, useForm } from "@mantine/form";
import { isSameDay, min, parse } from "date-fns";

const accounts = [
  { label: "Account 1", value: "account-1" },
  { label: "Account 2", value: "account-2" },
  { label: "Account 3", value: "account-3" },
  { label: "Account 4", value: "account-4" },
];

export type BookingValues = {
  key: string;
  date?: string;
  account?: string;
  description?: string;
  unit?: Unit;
  currency?: string;
  debit?: number;
  credit?: number;
};

export function SplitTransaction({
  bookings = [],
}: {
  bookings: BookingValues[];
}) {
  const { thousandSeparator, decimalSeparator } =
    getNumberFormatSymbols("en-CH");

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      date:
        bookings.length > 0
          ? min(bookings.map((d) => d.date as string).filter((d) => !!d))
          : undefined,
      description: "",
      bookings: bookings.map((b) => ({ ...b, key: createId() })),
    },
    onValuesChange: ({ date }, { date: previousDate }) => {
      if (date !== previousDate) {
        for (let i = 0; i < form.values.bookings.length; i++) {
          form.setFieldValue(`bookings.${i}.date`, date ?? undefined);
        }
      }
    },
    validate: {
      date: isNotEmpty("Date is required"),
      bookings: {
        [formRootRule]: (bookings) => {
          const difference =
            sum(bookings.map((b) => b.debit ?? 0)) -
            sum(bookings.map((b) => b.credit ?? 0));
          return difference !== 0
            ? `Transaction is not balanced; debits and credits differ by ${numericFormatter(
                difference.toString(),
                {
                  thousandSeparator,
                  decimalSeparator,
                  decimalScale: 2,
                },
              )}.`
            : null;
        },
        date: isNotEmpty("Date is required"),
        account: isNotEmpty("Account is required"),
        unit: isNotEmpty("Unit is required"),
        debit: (value) => (value === 0 ? "Must be non-zero" : null),
        credit: (value) => (value === 0 ? "Must be non-zero" : null),
      },
    },
  });

  const gridRef = useRef<AgGridReact>(null);

  function onAdd() {
    const newRow = {
      date: form.values.date,
      account: "",
      description: "",
      unit: Unit.CURRENCY,
      currency: "CHF",
      key: createId(),
    } as BookingValues;
    const result = gridRef.current?.api.applyTransaction({
      add: [newRow],
    });

    gridRef.current?.api.ensureIndexVisible(
      result?.add[0].rowIndex ?? 0,
      "bottom",
    );

    form.insertListItem("bookings", newRow);
  }

  console.log("Form errors", form.errors);

  return (
    <form
      onSubmit={(e) => {
        gridRef.current?.api.stopEditing();
        form.onSubmit((values) => console.log(values), console.error)(e);
      }}
    >
      <Stack gap="md">
        <Group align="start">
          <DateInput
            valueFormat="DD.MM.YYYY"
            dateParser={(value) => parse(value, "dd.MM.yyyy", new Date())}
            w={140}
            label={
              <Group gap={4}>
                Date
                <Tooltip
                  label={
                    <>
                      Changing this date overwrites all booking dates.
                      <br /> Individual bookings can be set to a later date.
                    </>
                  }
                  position="bottom-start"
                >
                  <IconInfoCircle size={16} />
                </Tooltip>
              </Group>
            }
            {...form.getInputProps("date")}
          />
          <TextInput
            label="Description"
            {...form.getInputProps("description")}
            flex="1"
          />
          <Button
            mt={24.8}
            variant="default"
            leftSection={<IconTablePlus size={16} />}
            onClick={() => onAdd()}
          >
            Add booking
          </Button>
        </Group>
        <DataGrid
          ref={gridRef}
          containerStyle={{
            height: `calc(100vh - 20rem)`,
          }}
          rowData={form.values.bookings}
          getRowId={({ data }) => data.key}
          columnDefs={columnDefs}
          defaultColDef={{
            editable: true,
            resizable: false,
            sortable: false,
            suppressHeaderMenuButton: true,
          }}
          onCellValueChanged={(e) => {
            form.setFieldValue(
              `bookings.${e.rowIndex}.${e.colDef.field}`,
              e.newValue,
            );

            form.setFieldValue(
              `bookings.${e.rowIndex}.${e.colDef.field === "credit" ? "debit" : "credit"}`,
              undefined,
            );
          }}
          grandTotalRow="pinnedBottom"
          context={{
            status: form.isValid("bookings") ? null : form.errors.bookings,
            canDelete: form.values.bookings.length <= 2, // at least 2 bookings are required for a split transaction
            onDelete: (key: string) => {
              const index = form.values.bookings.findIndex(
                (b) => b.key === key,
              );

              if (index === -1) throw new Error("Booking not found");

              form.removeListItem("bookings", index);
            },
            startDate: form.values.date,
            form,
          }}
        />

        <Group justify="end">
          <Button variant="subtle">Cancel</Button>
          <Button type="submit">Create</Button>
        </Group>
      </Stack>
    </form>
  );
}

const columnDefs = [
  {
    editable: false,
    width: 0,
    colSpan: (params) => (params.data ? 1 : 6),
    cellRendererSelector: (params) => {
      if (!params.data) {
        return {
          component: ({ context }: CustomCellRendererProps) => {
            if (!context.status) return null;
            return (
              <Group align="center" h="100%" gap="xs">
                <ThemeIcon variant="light" size="sm" color="red">
                  <IconX size={14} />
                </ThemeIcon>
                <Box>{context.status}</Box>
              </Group>
            );
          },
        };
      }

      return undefined;
    },
  },
  {
    field: "date",
    type: DATE_COLUMN,
    cellDataType: "dateString",
    width: 110,
    cellStyle: ({ value, context }: CellClassParams) =>
      isSameDay(value, context.startDate)
        ? { color: "var(--mantine-color-dimmed)" }
        : { color: "var(--mantine-color-yellow-text)", fontWeight: 600 },
    cellEditorParams: ({ context }: any) => ({
      startDate: context.startDate,
    }),
  },
  {
    field: "account",
    type: SELECT_COLUMN,
    context: { options: accounts },
    minWidth: 150,
    flex: 1,
    cellStyle: ({ context, node }: CellClassParams) =>
      context.form.errors[`bookings.${node.rowIndex}.account`]
        ? { borderColor: "var(--mantine-color-error)" }
        : { borderColor: "transparent" },
  },
  {
    field: "description",
    type: TEXT_COLUMN,
    width: 150,
  },
  {
    field: "unit",
    type: SELECT_COLUMN,
    width: 120,
    context: {
      options: [
        { label: "Currency", value: Unit.CURRENCY },
        { label: "Crypto", value: Unit.CRYPTOCURRENCY },
        { label: "Security", value: Unit.SECURITY },
      ],
    },
  },
  {
    field: "currency",
    headerName: "Ccy.",
    type: SELECT_COLUMN,
    width: 90,
    context: {
      options: [
        { label: "CHF", value: "CHF" },
        { label: "EUR", value: "EUR" },
        { label: "USD", value: "USD" },
      ],
    },
  },
  {
    field: "debit",
    type: FORMATTED_NUMERIC_COLUMN,
    aggFunc: "sum",
    width: 105,
    cellStyle: ({ context, node }: CellClassParams) =>
      context.form.errors[`bookings.${node.rowIndex}.debit`]
        ? { borderColor: "var(--mantine-color-error)" }
        : { borderColor: "transparent" },
  },
  {
    field: "credit",
    type: FORMATTED_NUMERIC_COLUMN,
    aggFunc: "sum",
    width: 105,
    tooltipValueGetter: ({ context, node }) =>
      context.form.errors[`bookings.${node?.rowIndex}.credit`],
    cellStyle: ({ context, node }) =>
      context.form.errors[`bookings.${node?.rowIndex}.credit`]
        ? { borderColor: "var(--mantine-color-error)" }
        : { borderColor: "transparent" },
  },
  {
    editable: false,
    width: 60,
    cellRenderer: ({ data, context }: CustomCellRendererProps) => {
      if (!data) return;
      return (
        <ActionIcon
          mt={4}
          color="red"
          size="md"
          variant="subtle"
          disabled={context.canDelete}
          onClick={() => {
            if (context.onDelete) {
              context.onDelete(data.key);
            }
          }}
        >
          <IconTrash size={16} />
        </ActionIcon>
      );
    },
  },
] as ColDef[];
