import { Alert, Button, Group, Select, Stack, Text } from "@mantine/core";
import { Dropzone, MIME_TYPES, type FileRejection } from "@mantine/dropzone";
import {
  IconFileCheck,
  IconFileText,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { SAMPLE_EXAMPLES, type ExampleKey } from "./examples";
import classes from "./settings-page.module.css";

export type SampleSource = { name: string; text: string };
const CSV_DROPZONE_ACCEPT = { [MIME_TYPES.csv]: [".csv"] };

export function SampleUpload({
  source,
  onSourceChange,
}: {
  source: SampleSource | null;
  onSourceChange: (source: SampleSource | null) => void;
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

  function changeSource(next: SampleSource | null) {
    request.current += 1;
    setReading(false);
    setFileError("");
    onSourceChange(next);
  }
  async function readFile(file: File) {
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
    }
  }
  function rejectFiles(rejections: FileRejection[]) {
    request.current += 1;
    setReading(false);
    setFileError(
      rejections.some(({ errors }) =>
        errors.some(({ code }) => code === "too-many-files"),
      )
        ? "Choose one CSV file at a time."
        : "Choose a CSV file with the .csv extension.",
    );
  }
  return (
    <Stack gap="sm">
      <div className={classes.sampleActions}>
        <Dropzone
          accept={CSV_DROPZONE_ACCEPT}
          maxFiles={1}
          multiple={false}
          loading={reading}
          p="md"
          radius="sm"
          w="100%"
          maw={520}
          role="button"
          aria-label="Upload Sample CSV"
          inputProps={{ "aria-label": "Sample CSV File" }}
          // Check the entire selection before accepting any file from a mixed/multiple drop.
          onDropAny={(files, rejections) => {
            if (rejections.length) rejectFiles(rejections);
            else if (files[0]) void readFile(files[0]);
          }}
          onDrop={() => undefined}
        >
          <Group
            justify="center"
            gap="md"
            mih={64}
            wrap="nowrap"
            className={classes.dropzoneContent}
          >
            <Dropzone.Accept>
              <IconFileCheck
                size={32}
                stroke={1.5}
                color="var(--mantine-color-green-6)"
              />
            </Dropzone.Accept>
            <Dropzone.Reject>
              <IconX
                size={32}
                stroke={1.5}
                color="var(--mantine-color-red-6)"
              />
            </Dropzone.Reject>
            <Dropzone.Idle>
              <IconUpload
                size={32}
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
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" miw={0}>
            <IconFileText
              size={16}
              stroke={1.5}
              color="var(--mantine-color-dimmed)"
            />
            <Text size="sm" fw={500} truncate>
              {source.name}
            </Text>
          </Group>
          <Button
            size="xs"
            variant="subtle"
            color="red"
            leftSection={<IconX size={14} />}
            aria-label="Remove Sample"
            onClick={() => changeSource(null)}
          >
            Remove
          </Button>
        </Group>
      )}
    </Stack>
  );
}
