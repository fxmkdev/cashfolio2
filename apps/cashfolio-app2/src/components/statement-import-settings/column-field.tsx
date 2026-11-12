import {
  Autocomplete,
  Group,
  Input,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useId } from "react";
import type { ColumnChoice } from "./form-state";
import type { SamplePreview } from "./csv-preview";

export function ColumnField({
  label,
  value,
  onChange,
  hasHeader,
  sample,
  error,
  required = false,
}: {
  label: string;
  value: ColumnChoice;
  onChange: (value: ColumnChoice) => void;
  hasHeader: boolean;
  sample: SamplePreview | null;
  error?: string;
  required?: boolean;
}) {
  const id = useId();
  const headerNames = [
    ...new Set(sample?.headers.filter((header) => header.trim()) ?? []),
  ];
  const index =
    value.kind === "position"
      ? Number(value.value) - 1
      : (sample?.headers.findIndex(
          (header) =>
            header.trim().toLowerCase() === value.value.trim().toLowerCase(),
        ) ?? -1);
  const sampleValue = index >= 0 ? sample?.rows[0]?.values[index] : undefined;
  return (
    <Stack gap={4}>
      <Input.Label htmlFor={id} required={required}>
        {label}
      </Input.Label>
      <Group gap="xs" align="start" wrap="nowrap">
        <Select
          aria-label={`${label} Reference`}
          w={145}
          flex="0 0 145px"
          data={[
            { value: "header", label: "Header Name", disabled: !hasHeader },
            { value: "position", label: "Position" },
          ]}
          value={value.kind}
          allowDeselect={false}
          onChange={(kind) =>
            kind && onChange({ kind: kind as ColumnChoice["kind"], value: "" })
          }
        />
        {value.kind === "header" ? (
          <Autocomplete
            id={id}
            aria-required={required}
            placeholder="Choose or enter a header"
            data={headerNames}
            value={value.value}
            onChange={(next) => onChange({ ...value, value: next })}
            error={error}
            flex={1}
          />
        ) : (
          <TextInput
            id={id}
            aria-required={required}
            placeholder="Column number, starting at 1"
            inputMode="numeric"
            value={value.value}
            onChange={(event) =>
              onChange({ ...value, value: event.currentTarget.value })
            }
            error={error}
            flex={1}
          />
        )}
      </Group>
      {sampleValue !== undefined && (
        <Text size="xs" c="dimmed">
          Sample: {sampleValue || "(empty)"}
        </Text>
      )}
    </Stack>
  );
}
