import {
  Box,
  Button,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { type UseFormReturnType, useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";
import { IconCheck } from "@tabler/icons-react";
import { LinkButton } from "@/components/link-button";
import { TopPageHeader } from "@/components/top-page-header";
import { currencies } from "@/currencies";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import { normalizeDateInputValue, startOfUtcDay } from "@/shared/date";
import type { loadAccountBookSettingsPageData } from "./-page-loader";

type AccountBookSettingsPageData = Awaited<
  ReturnType<typeof loadAccountBookSettingsPageData>
>;

type AccountBookSettingsFormValues = {
  name: string;
  referenceCurrency: string | null;
  startDate: Date | string | null;
};

function getCurrencyOptions() {
  return Object.entries(currencies)
    .map(([code, label]) => ({
      value: code,
      label: `${code} - ${label}`,
    }))
    .sort((left, right) => left.value.localeCompare(right.value));
}

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
    message: "Account book settings saved.",
  });
}

function SettingsFormFields(args: {
  form: UseFormReturnType<AccountBookSettingsFormValues>;
  isSubmitting: boolean;
  submitError: string | null;
  currencyOptions: { value: string; label: string }[];
}) {
  return (
    <Stack gap="md">
      <TextInput
        label="Account Book Name"
        withAsterisk
        disabled={args.isSubmitting}
        {...args.form.getInputProps("name")}
      />

      <Select
        label="Reference Currency"
        withAsterisk
        searchable
        allowDeselect={false}
        disabled={args.isSubmitting}
        data={args.currencyOptions}
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

export function AccountBookSettingsPageView(args: {
  accountBookId: string;
  settings: AccountBookSettingsPageData;
  onSubmit: (values: {
    name: string;
    referenceCurrency: string;
    startDate: string;
  }) => Promise<void>;
}) {
  const { accountBookId, settings } = args;
  const { isSubmitting, runSubmit } = useDialogSubmitState();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const currencyOptions = useMemo(() => getCurrencyOptions(), []);

  const form = useForm<AccountBookSettingsFormValues>({
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
    <Box py="xl" px="xl" style={{ width: "100%" }}>
      <TopPageHeader
        heading={<Title order={2}>Settings</Title>}
        actions={
          <Group>
            <LinkButton
              variant="default"
              to="/$accountBookId/accounts"
              params={{ accountBookId }}
              search={{ tab: "ASSET", mode: "active" }}
            >
              Back to Accounts
            </LinkButton>
          </Group>
        }
      />

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
                  : "Failed to save account book settings.",
              );
            }
          });
        })}
      >
        <SettingsFormFields
          form={form}
          isSubmitting={isSubmitting}
          submitError={submitError}
          currencyOptions={currencyOptions}
        />
      </form>
    </Box>
  );
}
