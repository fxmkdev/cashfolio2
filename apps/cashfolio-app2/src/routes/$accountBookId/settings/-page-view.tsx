import {
  Button,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { type UseFormReturnType, useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { type FormEvent, useEffect, useState } from "react";
import { IconAlertTriangle, IconCheck, IconTrash } from "@tabler/icons-react";
import { NarrowPageShell } from "@/components/narrow-page-shell";
import { TopPageHeader } from "@/components/top-page-header";
import { CurrencySelect } from "@/components/unit-select";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import { normalizeDateInputValue, startOfUtcDay } from "@/shared/date";
import type { loadSettingsPageData } from "./-page-loader";

type SettingsPageData = Awaited<ReturnType<typeof loadSettingsPageData>>;

type SettingsFormValues = {
  name: string;
  referenceCurrency: string | null;
  startDate: Date | string | null;
};

function validateStartDate(value: Date | string | null) {
  const startDate = normalizeDateInputValue(value);
  if (!startDate) {
    return value ? "Start date is invalid" : "Start date is required";
  }

  const startDay = startOfUtcDay(startDate);
  if (startDay > startOfUtcDay(new Date())) {
    return "Start date cannot be in the future";
  }

  return null;
}

function showSettingsSavedNotification() {
  notifications.show({
    color: "green",
    icon: <IconCheck size={16} />,
    title: "Saved",
    message: "Settings saved.",
    withBorder: true,
  });
}

function showAccountBookDeletedNotification() {
  notifications.show({
    color: "green",
    icon: <IconCheck size={16} />,
    title: "Deleted",
    message: "Account book deleted.",
    withBorder: true,
  });
}

export function isDeleteAccountBookConfirmationMatch(args: {
  confirmationName: string;
  accountBookName: string;
}): boolean {
  return args.confirmationName.trim() === args.accountBookName;
}

function SettingsFormFields(args: {
  form: UseFormReturnType<SettingsFormValues>;
  isSubmitting: boolean;
  submitError: string | null;
  settings: SettingsPageData;
}) {
  return (
    <Stack gap="md">
      <TextInput
        label="Account Book Name"
        withAsterisk
        disabled={args.isSubmitting}
        {...args.form.getInputProps("name")}
      />

      <CurrencySelect
        label="Reference Currency"
        withAsterisk
        allowDeselect={false}
        disabled={args.isSubmitting}
        unitUsage={args.settings.unitUsage}
        selectedCurrency={args.form.values.referenceCurrency}
        compactLabels={false}
        {...args.form.getInputProps("referenceCurrency")}
      />

      <DateInput
        valueFormat="DD.MM.YYYY"
        dateParser={(value) => normalizeDateInputValue(value)}
        label="Start Date"
        withAsterisk
        maxDate={startOfUtcDay(new Date())}
        disabled={args.isSubmitting}
        {...args.form.getInputProps("startDate")}
      />

      {args.submitError && (
        <Text size="sm" c="red">
          {args.submitError}
        </Text>
      )}

      <Group justify="end">
        <Button
          type="submit"
          loading={args.isSubmitting}
          disabled={args.isSubmitting}
        >
          Save
        </Button>
      </Group>
    </Stack>
  );
}

function DeleteAccountBookModal(args: {
  opened: boolean;
  accountBookName: string;
  onClose: () => void;
  onConfirm: (values: { confirmationName: string }) => Promise<void>;
}) {
  const { isSubmitting, runSubmit } = useDialogSubmitState();
  const [confirmationName, setConfirmationName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const confirmationMatches = isDeleteAccountBookConfirmationMatch({
    confirmationName,
    accountBookName: args.accountBookName,
  });

  useEffect(() => {
    if (!args.opened) {
      setConfirmationName("");
      setSubmitError(null);
    }
  }, [args.opened]);

  const handleClose = () => {
    if (isSubmitting) return;
    args.onClose();
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmationMatches) return;

    setSubmitError(null);
    await runSubmit(async () => {
      try {
        await args.onConfirm({ confirmationName });
        showAccountBookDeletedNotification();
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error.message
            : "Failed to delete account book.",
        );
      }
    });
  }

  return (
    <Modal
      opened={args.opened}
      onClose={handleClose}
      title="Delete Account Book"
      closeOnEscape={!isSubmitting}
      closeOnClickOutside={!isSubmitting}
      withCloseButton={!isSubmitting}
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <Text>
            This will permanently delete the account book{" "}
            <Text component="span" fw={700}>
              {args.accountBookName}
            </Text>{" "}
            and all of its accounts, transactions, bookings, and user access.
          </Text>
          <Text size="sm" c="dimmed">
            Type the account book name to confirm.
          </Text>
          <TextInput
            label="Account Book Name"
            value={confirmationName}
            onChange={(event) => setConfirmationName(event.currentTarget.value)}
            disabled={isSubmitting}
            data-autofocus
          />

          {submitError && (
            <Text size="sm" c="red">
              {submitError}
            </Text>
          )}

          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              color="red"
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting || !confirmationMatches}
              leftSection={<IconTrash size={16} />}
            >
              Delete Account Book
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function DangerZone(args: { onDeleteClick: () => void }) {
  return (
    <Stack gap="md" mt="xl">
      <Divider />
      <Group justify="space-between" align="flex-start" gap="lg">
        <Stack gap={4}>
          <Group gap="xs">
            <IconAlertTriangle size={18} color="var(--mantine-color-red-6)" />
            <Title order={3}>Danger Zone</Title>
          </Group>
          <Text size="sm" c="dimmed">
            Permanently delete this account book and all data inside it.
          </Text>
        </Stack>
        <Button
          color="red"
          variant="outline"
          leftSection={<IconTrash size={16} />}
          onClick={args.onDeleteClick}
        >
          Delete Account Book
        </Button>
      </Group>
    </Stack>
  );
}

export function SettingsPageView(args: {
  accountBookId: string;
  settings: SettingsPageData;
  onSubmit: (values: {
    name: string;
    referenceCurrency: string;
    startDate: string;
  }) => Promise<void>;
  onDelete: (values: { confirmationName: string }) => Promise<void>;
}) {
  const { settings } = args;
  const { isSubmitting, runSubmit } = useDialogSubmitState();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);

  const form = useForm<SettingsFormValues>({
    mode: "controlled",
    initialValues: {
      name: settings.name,
      referenceCurrency: settings.referenceCurrency,
      startDate: settings.startDate,
    },
    validate: {
      name: (value) =>
        value.trim().length === 0 ? "Account book name is required" : null,
      referenceCurrency: (value) =>
        value ? null : "Reference currency is required",
      startDate: validateStartDate,
    },
  });

  useEffect(() => {
    form.setValues({
      name: settings.name,
      referenceCurrency: settings.referenceCurrency,
      startDate: settings.startDate,
    });
    form.resetDirty();
    setSubmitError(null);
  }, [settings]);

  return (
    <NarrowPageShell>
      <TopPageHeader heading={<Title order={2}>Settings</Title>} />

      <form
        onSubmit={form.onSubmit(async (values) => {
          const normalizedStartDate = normalizeDateInputValue(values.startDate);
          const referenceCurrency = values.referenceCurrency;
          if (!normalizedStartDate || !referenceCurrency) {
            return;
          }

          setSubmitError(null);
          await runSubmit(async () => {
            try {
              await args.onSubmit({
                name: values.name.trim(),
                referenceCurrency,
                startDate: startOfUtcDay(normalizedStartDate).toISOString(),
              });
              showSettingsSavedNotification();
            } catch (error) {
              setSubmitError(
                error instanceof Error
                  ? error.message
                  : "Failed to save settings.",
              );
            }
          });
        })}
      >
        <SettingsFormFields
          form={form}
          isSubmitting={isSubmitting}
          submitError={submitError}
          settings={settings}
        />
      </form>

      <DangerZone onDeleteClick={() => setDeleteModalOpened(true)} />

      <DeleteAccountBookModal
        opened={deleteModalOpened}
        accountBookName={settings.name}
        onClose={() => setDeleteModalOpened(false)}
        onConfirm={args.onDelete}
      />
    </NarrowPageShell>
  );
}
