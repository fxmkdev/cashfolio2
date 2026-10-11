import {
  Group,
  Input,
  Textarea,
  type TextareaProps,
  Popover,
  Tooltip,
  ActionIcon,
  Stack,
  Text,
  Box,
  Code,
  CopyButton,
  Button,
} from "@mantine/core";
import { IconInfoCircle, IconCheck, IconCopy } from "@tabler/icons-react";

const STATEMENT_IMPORT_CSV_FORMAT_EXAMPLE = JSON.stringify(
  {
    hasHeader: true,
    delimitersToGuess: [",", ";"],
    columns: [
      "date",
      "amount",
      "original amount",
      "original currency",
      "exchange rate",
      "description",
    ],
    dateFormat: "yyyy-MM-dd",
    numberFormat: {
      decimalSeparator: ".",
    },
  },
  null,
  2,
);

const STATEMENT_IMPORT_CSV_FORMAT_PLACEHOLDER =
  "Paste a statement import CSV format JSON object.";

const STATEMENT_IMPORT_CSV_FORMAT_HELP_VIEWPORT_PADDING = 12;

function StatementImportCsvFormatHelp() {
  return (
    <Popover
      width={420}
      position="bottom-start"
      withArrow
      shadow="md"
      withinPortal
      middlewares={{
        flip: true,
        shift: { padding: STATEMENT_IMPORT_CSV_FORMAT_HELP_VIEWPORT_PADDING },
      }}
    >
      <Popover.Target>
        <Tooltip label="Show CSV format JSON help">
          <ActionIcon
            aria-label="Show statement import CSV format help"
            size="sm"
            variant="subtle"
          >
            <IconInfoCircle size={16} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm">
            Use ordered columns for positional CSVs. Use mappings with index or
            header refs for custom layouts. Leave the field empty to make
            imports unavailable for this account.
          </Text>
          <Box mah="32vh" style={{ overflow: "auto" }}>
            <Code block>{STATEMENT_IMPORT_CSV_FORMAT_EXAMPLE}</Code>
          </Box>
          <CopyButton value={STATEMENT_IMPORT_CSV_FORMAT_EXAMPLE}>
            {({ copied, copy }) => (
              <Button
                leftSection={
                  copied ? <IconCheck size={16} /> : <IconCopy size={16} />
                }
                onClick={copy}
                size="xs"
                variant="light"
              >
                {copied ? "Copied" : "Copy example"}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

export function StatementImportCsvFormatField({
  inputId,
  inputProps,
}: {
  inputId: string;
  inputProps: TextareaProps;
}) {
  return (
    <Stack gap={4}>
      <Group gap={4}>
        <Input.Label htmlFor={inputId}>Statement import CSV format</Input.Label>
        <StatementImportCsvFormatHelp />
      </Group>
      <Textarea
        id={inputId}
        description="Required for statement imports. Open help to copy an example format."
        placeholder={STATEMENT_IMPORT_CSV_FORMAT_PLACEHOLDER}
        autosize
        minRows={6}
        maxRows={12}
        {...inputProps}
      />
    </Stack>
  );
}
