import {
  Accordion,
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { createId } from "@paralleldrive/cuid2";
import { ColumnField } from "./column-field";
import {
  columnChoice,
  type MappingField,
  type SettingsDraft,
} from "./form-state";
import type { SamplePreview } from "./csv-preview";

export function MappingFields({
  draft,
  onChange,
  sample,
  fieldErrors,
}: {
  draft: SettingsDraft;
  onChange: (changes: Partial<SettingsDraft>) => void;
  sample: SamplePreview | null;
  fieldErrors: Record<string, string>;
}) {
  const field = (key: MappingField, label: string, required = false) => (
    <ColumnField
      label={label}
      value={draft[key]}
      hasHeader={draft.hasHeader}
      sample={sample}
      error={fieldErrors[key]}
      required={required}
      onChange={(value) => onChange({ [key]: value })}
    />
  );
  function moveDescription(index: number, offset: number) {
    const descriptions = [...draft.descriptions];
    [descriptions[index], descriptions[index + offset]] = [
      descriptions[index + offset],
      descriptions[index],
    ];
    onChange({ descriptions });
  }
  return (
    <Stack gap="md">
      <Title order={3} size="h5">
        Column Mappings
      </Title>
      <Text size="sm" c="dimmed">
        Choose each column manually. Unmapped CSV columns are ignored.
      </Text>
      {field("date", "Date Column", true)}
      <Select
        label="Amount Layout"
        value={draft.amountMode}
        allowDeselect={false}
        data={[
          { value: "signed", label: "One Signed Amount Column" },
          { value: "debit-credit", label: "Separate Debit/Credit Columns" },
        ]}
        onChange={(value) =>
          value &&
          onChange({ amountMode: value as SettingsDraft["amountMode"] })
        }
      />
      {draft.amountMode === "signed" ? (
        <>
          {field("amount", "Amount Column", true)}
          <Checkbox
            label="Invert Amount Signs"
            description="Use when the statement’s positive and negative amounts are reversed for this account."
            checked={draft.invertSign}
            onChange={(event) =>
              onChange({ invertSign: event.currentTarget.checked })
            }
          />
        </>
      ) : (
        <>
          {field("debit", "Debit Column")}
          {field("credit", "Credit Column")}
          <Text size="xs" c="dimmed">
            Map at least one column. Debit becomes positive; credit becomes
            negative. A row must contain one non-zero amount.
          </Text>
        </>
      )}
      <Stack gap="sm">
        <Title order={4} size="sm">
          Description
        </Title>
        <Text size="xs" c="dimmed">
          Optional. Combine columns in the order below; blank values are
          omitted.
        </Text>
        {draft.descriptions.map(({ id, column }, index) => (
          <Stack key={id} gap={4}>
            <ColumnField
              label={`Description Column ${index + 1}`}
              value={column}
              hasHeader={draft.hasHeader}
              sample={sample}
              error={fieldErrors[id]}
              onChange={(value) =>
                onChange({
                  descriptions: draft.descriptions.map((item) =>
                    item.id === id ? { ...item, column: value } : item,
                  ),
                })
              }
            />
            <Group justify="end" gap={4}>
              <Tooltip label="Move Up">
                <ActionIcon
                  variant="subtle"
                  aria-label={`Move Description Column ${index + 1} Up`}
                  disabled={index === 0}
                  onClick={() => moveDescription(index, -1)}
                >
                  <IconArrowUp size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Move Down">
                <ActionIcon
                  variant="subtle"
                  aria-label={`Move Description Column ${index + 1} Down`}
                  disabled={index === draft.descriptions.length - 1}
                  onClick={() => moveDescription(index, 1)}
                >
                  <IconArrowDown size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Remove Column">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={`Remove Description Column ${index + 1}`}
                  onClick={() =>
                    onChange({
                      descriptions: draft.descriptions.filter(
                        (item) => item.id !== id,
                      ),
                    })
                  }
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Stack>
        ))}
        <Button
          variant="light"
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={() =>
            onChange({
              descriptions: [
                ...draft.descriptions,
                {
                  id: createId(),
                  column: columnChoice(undefined, draft.hasHeader),
                },
              ],
            })
          }
        >
          Add Description Column
        </Button>
        {draft.descriptions.length > 0 && (
          <TextInput
            label="Joining Separator"
            description="A space is used by default. Clear to join without a separator."
            value={draft.separator}
            onChange={(event) =>
              onChange({ separator: event.currentTarget.value })
            }
          />
        )}
      </Stack>
      <Accordion
        variant="separated"
        defaultValue={
          draft.originalAmount.value ||
          draft.originalCurrency.value ||
          draft.exchangeRate.value
            ? "advanced"
            : null
        }
      >
        <Accordion.Item value="advanced">
          <Accordion.Control>Advanced Fields</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Text size="xs" c="dimmed">
                Optional fields for statements with foreign-currency
                transactions.
              </Text>
              {field("originalAmount", "Original Amount Column")}
              {field("originalCurrency", "Original Currency Column")}
              {field("exchangeRate", "Exchange Rate Column")}
              <Text size="xs" c="dimmed">
                Exchange rate is retained in the configuration but currently
                ignored by the importer.
              </Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
