import {
  Alert,
  Badge,
  Box,
  Button,
  FileButton,
  Group,
  Paper,
  Select,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { IconFileTypeCsv, IconUpload } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { SAMPLE_EXAMPLES, type ExampleKey } from "./examples";
import classes from "./settings-dialog.module.css";

export type SampleSource = { name: string; text: string };

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
  const [fileError, setFileError] = useState("");
  const [reading, setReading] = useState(false);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  const fileReset = useRef<() => void>(null);
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
  function changeSource(next: SampleSource | null) {
    request.current += 1;
    setReading(false);
    setFileError("");
    fileReset.current?.();
    onSourceChange(next);
  }
  async function readFile(file: File | null) {
    if (!file) return;
    const token = ++request.current;
    setReading(true);
    setFileError("");
    try {
      const text = await file.text();
      if (request.current === token) onSourceChange({ name: file.name, text });
    } catch {
      if (request.current === token)
        setFileError(
          "The file could not be read. Choose it again or try another CSV.",
        );
    } finally {
      if (request.current === token) setReading(false);
      fileReset.current?.();
    }
  }
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
        <div className={classes.sampleActions}>
          <FileButton
            onChange={readFile}
            accept=".csv,text/csv,text/plain"
            resetRef={fileReset}
          >
            {(props) => (
              <Button
                {...props}
                variant="light"
                loading={reading}
                leftSection={<IconUpload size={16} />}
              >
                Choose CSV
              </Button>
            )}
          </FileButton>
          <Select
            label="Load an Example"
            placeholder="Choose sample data"
            value={null}
            data={Object.entries(SAMPLE_EXAMPLES).map(([value, example]) => ({
              value,
              label: example.label,
            }))}
            onChange={(value) => {
              if (value) {
                const example = SAMPLE_EXAMPLES[value as ExampleKey];
                changeSource({ name: example.label, text: example.text });
              }
            }}
          />
        </div>
        {fileError && (
          <Alert color="red" role="alert">
            {fileError}
          </Alert>
        )}
        {source && (
          <Group justify="space-between">
            <Text size="sm" fw={500} truncate>
              {source.name}
            </Text>
            <Button
              variant="subtle"
              size="xs"
              onClick={() => changeSource(null)}
            >
              Clear Sample
            </Button>
          </Group>
        )}
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
                <Box h={320}>
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
                    <Box h={320}>
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
