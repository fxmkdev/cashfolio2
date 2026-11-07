import {
  Alert,
  Button,
  Divider,
  Group,
  Modal,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { useMemo, useState } from "react";
import type { StatementImportCsvFormat } from "@/shared/statement-import-csv-format";
import {
  createSettingsDraft,
  validateSettings,
  type SettingsDraft,
} from "./form-state";
import { parseSample } from "./csv-preview";
import { FormatFields } from "./format-fields";
import { MappingFields } from "./mapping-fields";
import { SamplePanel, type SampleSource } from "./sample-panel";
import classes from "./settings-dialog.module.css";

export type StatementImportSettingsDialogProps = {
  opened: boolean;
  accountName: string;
  initialFormat: StatementImportCsvFormat | null;
  onClose: () => void;
  onSave: (format: StatementImportCsvFormat | null) => void;
};

// Unmount the editing session on close so every entry path discards unsaved edits.
export function StatementImportSettingsDialog(
  props: StatementImportSettingsDialogProps,
) {
  return props.opened ? <SettingsSession {...props} /> : null;
}

function SettingsSession({
  opened,
  accountName,
  initialFormat,
  onClose,
  onSave,
}: StatementImportSettingsDialogProps) {
  const [draft, setDraft] = useState(() => createSettingsDraft(initialFormat));
  const [source, setSource] = useState<SampleSource | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const validation = useMemo(() => validateSettings(draft), [draft]);
  const sample = useMemo(
    () =>
      source
        ? parseSample(source.text, draft.hasHeader, draft.delimiters)
        : null,
    [source, draft.hasHeader, draft.delimiters],
  );
  const change = (changes: Partial<SettingsDraft>) =>
    setDraft((previous) => ({ ...previous, ...changes }));
  const hasErrors =
    Object.keys(validation.fieldErrors).length > 0 ||
    validation.errors.length > 0;
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Statement Import Settings"
      size={1180}
      closeButtonProps={{ "aria-label": "Close Statement Import Settings" }}
      classNames={{ body: classes.body }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!hasErrors) onSave(validation.format);
          else {
            const form = event.currentTarget;
            requestAnimationFrame(() =>
              form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
            );
          }
        }}
      >
        <Stack gap="lg">
          <Text c="dimmed" size="sm">
            {accountName}
          </Text>
          <Switch
            label="Enable Statement Imports"
            aria-label="Enable Statement Imports"
            description="Configure how CSV statements are read for this account."
            checked={draft.enabled}
            onChange={(event) =>
              change({ enabled: event.currentTarget.checked })
            }
          />
          {!draft.enabled ? (
            <Alert color="gray">
              Statement imports are disabled for this account. Enable them to
              configure a CSV format.
            </Alert>
          ) : (
            <div className={classes.layout}>
              <Stack gap="lg">
                <FormatFields draft={draft} onChange={change} />
                <Divider />
                <MappingFields
                  draft={draft}
                  onChange={change}
                  sample={sample}
                  fieldErrors={submitted ? validation.fieldErrors : {}}
                />
                {validation.errors.length > 0 && (
                  <Alert color="red" title="Check File Format" role="alert">
                    <Stack gap={4}>
                      {validation.errors.map((error) => (
                        <Text size="sm" key={error}>
                          {error}
                        </Text>
                      ))}
                    </Stack>
                  </Alert>
                )}
                {submitted &&
                  Object.keys(validation.fieldErrors).length > 0 && (
                    <Alert color="red" role="alert">
                      Complete the highlighted column mappings before saving.
                    </Alert>
                  )}
              </Stack>
              <SamplePanel
                source={source}
                onSourceChange={setSource}
                sample={sample}
                format={validation.format}
              />
            </div>
          )}
          <Group
            justify="space-between"
            className={classes.footer}
            wrap="nowrap"
          >
            <Text size="xs" c="dimmed" visibleFrom="sm">
              {draft.enabled
                ? "Settings apply to future statement imports."
                : "Save to disable statement imports."}
            </Text>
            <Group gap="xs" wrap="nowrap" ml="auto">
              <Button variant="subtle" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Save Settings</Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
