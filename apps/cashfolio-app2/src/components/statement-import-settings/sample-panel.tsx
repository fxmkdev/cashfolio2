import {
  Alert,
  Badge,
  Box,
  Group,
  Paper,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { IconFileTypeCsv } from "@tabler/icons-react";
import { useMemo } from "react";
import { NumericFormat } from "react-number-format";
import type { ColDef, ICellRendererParams } from "ag-grid-enterprise";
import { DataGrid } from "../grid/data-grid";
import { getNumberFormatSymbols } from "../controls/formatted-number-input";
import { useUserLocale } from "@/user-locale-context";
import type { StatementImportCsvFormat } from "@/shared/statement-import-csv-format";
import {
  createParsedPreview,
  getSampleMappingErrors,
  PREVIEW_ROW_LIMIT,
  type ParsedPreviewRow,
  type SamplePreview,
} from "./csv-preview";
import { SampleUpload, type SampleSource } from "./sample-upload";
import classes from "./settings-page.module.css";

function PreviewAmount({
  value,
}: ICellRendererParams<ParsedPreviewRow, string>) {
  const locale = useUserLocale();
  if (!value) return null;
  return (
    <NumericFormat
      value={value}
      valueIsNumericString
      displayType="text"
      {...getNumberFormatSymbols(locale)}
    />
  );
}

const parsedColumns: ColDef<ParsedPreviewRow>[] = [
  { field: "sourceRow", headerName: "Row", width: 75, pinned: "left" },
  { field: "date", headerName: "Date", width: 130, cellDataType: "dateString" },
  {
    field: "amount",
    headerName: "Amount",
    width: 130,
    cellRenderer: PreviewAmount,
  },
  { field: "description", headerName: "Description", width: 220 },
  {
    field: "errors",
    headerName: "Errors",
    width: 300,
    wrapText: true,
    autoHeight: true,
  },
  {
    field: "originalAmount",
    headerName: "Original Amount",
    width: 150,
    cellRenderer: PreviewAmount,
  },
  { field: "originalCurrency", headerName: "Original Currency", width: 150 },
  { field: "exchangeRate", headerName: "Exchange Rate (Ignored)", width: 200 },
];

export function SamplePanel({
  source,
  onSourceChange,
  sample,
  format,
}: {
  source: SampleSource | null;
  onSourceChange: (source: SampleSource | null) => void;
  sample: SamplePreview | null;
  format: StatementImportCsvFormat | null;
}) {
  const parsedRows = useMemo(
    () => (sample && format ? createParsedPreview(sample, format) : []),
    [sample, format],
  );
  const mappingErrors = useMemo(
    () => (sample && format ? getSampleMappingErrors(sample, format) : []),
    [sample, format],
  );
  const errors = [...(sample?.errors ?? []), ...mappingErrors];
  const sourceColumns = useMemo<ColDef[]>(() => {
    if (!sample) return [];
    const width = Math.max(
      sample.headers.length,
      ...sample.rows.map((row) => row.values.length),
    );
    return [
      { field: "sourceRow", headerName: "Row", width: 75, pinned: "left" },
      ...Array.from({ length: width }, (_, index) => ({
        colId: String(index),
        headerName: sample.headers[index]
          ? `${index + 1} · ${sample.headers[index]}`
          : `Column ${index + 1}`,
        width: 160,
        valueGetter: ({ data }: { data: SamplePreview["rows"][number] }) =>
          data?.values[index] ?? "",
      })),
    ];
  }, [sample]);
  const invalidRowCount = parsedRows.filter((row) => row.errors).length;
  return (
    <Paper withBorder p="md" radius="md" className={classes.preview}>
      <Stack gap="md">
        <Group gap="xs">
          <IconFileTypeCsv size={22} />
          <Title order={3} size="h5">
            Sample Statement
          </Title>
          <Badge variant="light" color="gray">
            Optional
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          Use a statement to check your settings. The file stays in your
          browser. Choose mappings to see parsed values.
        </Text>
        <SampleUpload source={source} onSourceChange={onSourceChange} />
        {!sample ? (
          <Box className={classes.emptyPreview}>
            <Text fw={500}>See How Your Statement Will Be Read</Text>
            <Text size="sm" c="dimmed">
              Choose a CSV or load an example. You can also configure mappings
              without a sample.
            </Text>
          </Box>
        ) : (
          <>
            {errors.length > 0 && (
              <Alert title="Sample Needs Attention" color="orange">
                <Stack gap={4}>
                  {errors.map((error) => (
                    <Text size="sm" key={error}>
                      {error}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            )}
            <Tabs defaultValue="source" keepMounted={false}>
              <Tabs.List grow>
                <Tabs.Tab value="source">Source Data</Tabs.Tab>
                <Tabs.Tab value="parsed">Parsed Preview</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="source" pt="sm">
                <Box className={classes.previewGrid}>
                  <DataGrid
                    rowData={sample.rows}
                    columnDefs={sourceColumns}
                    getRowId={({ data }) => data.id}
                    defaultColDef={{
                      sortable: false,
                      suppressHeaderMenuButton: true,
                    }}
                  />
                </Box>
              </Tabs.Panel>
              <Tabs.Panel value="parsed" pt="sm">
                {!format ? (
                  <Box className={classes.emptyPreview}>
                    <Text size="sm" c="dimmed">
                      Enable imports and complete the required mappings to see
                      parsed values.
                    </Text>
                  </Box>
                ) : (
                  <Stack gap="sm">
                    {invalidRowCount > 0 && (
                      <Alert
                        color="orange"
                        title={`${invalidRowCount} Preview ${invalidRowCount === 1 ? "Row Has" : "Rows Have"} Errors`}
                      >
                        Check the Errors column and adjust the format or
                        mappings. Sample errors do not prevent saving valid
                        settings.
                      </Alert>
                    )}
                    <Box className={classes.previewGrid}>
                      <DataGrid
                        rowData={parsedRows}
                        columnDefs={parsedColumns}
                        getRowId={({ data }) => data.id}
                        defaultColDef={{
                          sortable: false,
                          suppressHeaderMenuButton: true,
                        }}
                      />
                    </Box>
                  </Stack>
                )}
              </Tabs.Panel>
            </Tabs>
            <Text size="xs" c="dimmed">
              Preview limited to the first {PREVIEW_ROW_LIMIT} data rows
              {sample.truncated
                ? "; more rows are available in the file"
                : ""}.{" "}
              {sample.delimiter &&
                `Detected delimiter: ${sample.delimiter === "\t" ? "Tab" : sample.delimiter}.`}{" "}
              This does not validate the entire file.
            </Text>
          </>
        )}
      </Stack>
    </Paper>
  );
}
