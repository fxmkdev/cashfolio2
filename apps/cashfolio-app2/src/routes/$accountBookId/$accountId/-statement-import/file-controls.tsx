import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { Dropzone, MIME_TYPES } from "@mantine/dropzone";
import {
  IconFileCheck,
  IconFileText,
  IconUpload,
  IconX,
} from "@tabler/icons-react";

const CSV_DROPZONE_ACCEPT = {
  [MIME_TYPES.csv]: [".csv"],
};

export function StatementImportFileControls({
  file,
  isSubmitting,
  onFileChange,
}: {
  file: File | null;
  isSubmitting: boolean;
  onFileChange: (file: File | null) => void;
}) {
  return (
    <Stack align="center" gap="xs" w="100%">
      <StatementImportDropzone
        disabled={isSubmitting}
        onFileChange={onFileChange}
      />

      {file ? (
        <StatementImportSelectedFile
          fileName={file.name}
          disabled={isSubmitting}
          onClear={() => onFileChange(null)}
        />
      ) : null}
    </Stack>
  );
}

function StatementImportDropzone({
  disabled,
  onFileChange,
}: {
  disabled: boolean;
  onFileChange: (file: File | null) => void;
}) {
  return (
    <Dropzone
      accept={CSV_DROPZONE_ACCEPT}
      disabled={disabled}
      maxFiles={1}
      multiple={false}
      p="lg"
      radius="sm"
      w="100%"
      maw={520}
      onDrop={(files) => onFileChange(files[0] ?? null)}
    >
      <Group justify="center" gap="md" mih={96} wrap="nowrap">
        <Dropzone.Accept>
          <IconFileCheck
            size={40}
            stroke={1.5}
            color="var(--mantine-color-green-6)"
          />
        </Dropzone.Accept>
        <Dropzone.Reject>
          <IconX size={40} stroke={1.5} color="var(--mantine-color-red-6)" />
        </Dropzone.Reject>
        <Dropzone.Idle>
          <IconUpload
            size={40}
            stroke={1.5}
            color="var(--mantine-color-dimmed)"
          />
        </Dropzone.Idle>

        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Drop CSV File Here
          </Text>
          <Text size="xs" c="dimmed">
            Drag and drop a statement, or click to select one.
          </Text>
        </Stack>
      </Group>
    </Dropzone>
  );
}

function StatementImportSelectedFile({
  disabled,
  fileName,
  onClear,
}: {
  disabled: boolean;
  fileName: string;
  onClear: () => void;
}) {
  return (
    <Group justify="space-between" gap="xs" wrap="nowrap" w="100%" maw={520}>
      <Group gap="xs" wrap="nowrap" miw={0}>
        <IconFileText
          size={16}
          stroke={1.5}
          color="var(--mantine-color-dimmed)"
        />
        <Text size="sm" truncate>
          {fileName}
        </Text>
      </Group>

      <Button
        size="xs"
        variant="subtle"
        color="red"
        leftSection={<IconX size={14} />}
        disabled={disabled}
        onClick={onClear}
      >
        Remove
      </Button>
    </Group>
  );
}

export function StatementImportReviewSummary({
  summaryText,
}: {
  summaryText: string;
}) {
  return (
    <Group
      h={40}
      px="sm"
      justify="space-between"
      align="center"
      gap="xs"
      wrap="nowrap"
      style={{
        border: "1px solid var(--mantine-color-default-border)",
        borderBottom: 0,
        borderTopLeftRadius: "var(--mantine-radius-sm)",
        borderTopRightRadius: "var(--mantine-radius-sm)",
        background: "var(--mantine-color-body)",
      }}
    >
      <Text c="dimmed" size="sm">
        {summaryText}
      </Text>
    </Group>
  );
}

export function StatementImportParseErrors({
  parseErrors,
}: {
  parseErrors: string[];
}) {
  if (parseErrors.length === 0) {
    return null;
  }

  return (
    <Alert color="red" title="CSV could not be imported">
      <Stack gap={4}>
        {parseErrors.map((error) => (
          <Text key={error} size="sm">
            {error}
          </Text>
        ))}
      </Stack>
    </Alert>
  );
}
