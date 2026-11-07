import {
  Checkbox,
  Select,
  SimpleGrid,
  Stack,
  TagsInput,
  Text,
  Title,
} from "@mantine/core";
import type { SettingsDraft } from "./form-state";

const delimiterLabels: Record<string, string> = {
  ",": "Comma (,)",
  ";": "Semicolon (;)",
  "\t": "Tab",
  "|": "Pipe (|)",
  " ": "Space",
};
export function FormatFields({
  draft,
  onChange,
}: {
  draft: SettingsDraft;
  onChange: (changes: Partial<SettingsDraft>) => void;
}) {
  return (
    <Stack gap="sm">
      <Title order={3} size="h5">
        File Format
      </Title>
      <Checkbox
        label="First Row Contains Headers"
        checked={draft.hasHeader}
        onChange={(event) =>
          onChange({ hasHeader: event.currentTarget.checked })
        }
      />
      <TagsInput
        label="Delimiter Candidates"
        description="Try these separators when reading a file. You can enter a custom separator."
        data={Object.values(delimiterLabels)}
        splitChars={[]}
        value={draft.delimiters.map((value) => delimiterLabels[value] ?? value)}
        onChange={(values) =>
          onChange({
            delimiters: values.map(
              (value) =>
                Object.entries(delimiterLabels).find(
                  ([, label]) => label === value,
                )?.[0] ?? value,
            ),
          })
        }
      />
      <Select
        label="Date Format"
        value={draft.dateFormat}
        allowDeselect={false}
        data={[
          { value: "yyyy-MM-dd", label: "Year-Month-Day (2026-11-07)" },
          { value: "dd.MM.yyyy", label: "Day.Month.Year (07.11.2026)" },
          { value: "MM/dd/yyyy", label: "Month/Day/Year (11/07/2026)" },
        ]}
        onChange={(value) =>
          value &&
          onChange({ dateFormat: value as SettingsDraft["dateFormat"] })
        }
      />
      <SimpleGrid cols={2}>
        <Select
          label="Decimal Separator"
          allowDeselect={false}
          value={draft.numberFormat.decimalSeparator}
          data={[
            { value: ".", label: "Point (.)" },
            { value: ",", label: "Comma (,)" },
          ]}
          onChange={(value) =>
            value &&
            onChange({
              numberFormat: {
                ...draft.numberFormat,
                decimalSeparator: value as "." | ",",
              },
            })
          }
        />
        <Select
          label="Thousands Separator"
          allowDeselect={false}
          value={draft.numberFormat.thousandsSeparator ?? "none"}
          data={[
            { value: "none", label: "None" },
            { value: ".", label: "Point (.)" },
            { value: ",", label: "Comma (,)" },
            { value: "'", label: "Apostrophe (')" },
            { value: " ", label: "Space" },
          ]}
          onChange={(value) =>
            value &&
            onChange({
              numberFormat: {
                ...draft.numberFormat,
                thousandsSeparator:
                  value === "none"
                    ? undefined
                    : (value as SettingsDraft["numberFormat"]["thousandsSeparator"]),
              },
            })
          }
        />
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        These formats describe the CSV values. Preview numbers use your display
        locale.
      </Text>
    </Stack>
  );
}
