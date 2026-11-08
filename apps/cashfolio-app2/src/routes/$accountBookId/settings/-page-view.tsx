import { RESOURCE_LIMITS } from "@/shared/resources/resource-limits";
import {
  Button,
  Group,
  Stack,
  TextInput,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { type UseFormReturnType, useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useEffect, useRef } from "react";
import { IconCheck } from "@tabler/icons-react";
import { MutationSubmitFeedback } from "@/components/dialogs/mutation-submit-feedback";
import { NarrowPageShell } from "@/components/layout/narrow-page-shell";
import { CurrencySelect } from "@/components/controls/unit-select";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  getDateInputValueFormat,
  normalizeDateInputValue,
  startOfUtcDay,
} from "@/shared/date";
import { useUserLocale } from "@/user-locale-context";
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

function SettingsFormFields(args: {
  form: UseFormReturnType<SettingsFormValues>;
  isDisabled: boolean;
  isSubmitting: boolean;
  submitState: ReturnType<typeof useDialogSubmitState>;
  onRefreshConstraints?: () => Promise<void>;
  settings: SettingsPageData;
}) {
  const userLocale = useUserLocale();

  return (
    <Stack gap="md">
      <TextInput
        label="Account Book Name"
        withAsterisk
        disabled={args.isDisabled}
        {...args.form.getInputProps("name")}
      />

      <CurrencySelect
        label="Reference Currency"
        withAsterisk
        allowDeselect={false}
        disabled={args.isDisabled}
        unitUsage={args.settings.unitUsage}
        selectedCurrency={args.form.values.referenceCurrency}
        compactLabels={false}
        {...args.form.getInputProps("referenceCurrency")}
      />

      <DateInput
        valueFormat={getDateInputValueFormat(userLocale)}
        dateParser={(value) => normalizeDateInputValue(value, userLocale)}
        label="Start Date"
        withAsterisk
        maxDate={startOfUtcDay(new Date())}
        disabled={args.isDisabled}
        {...args.form.getInputProps("startDate")}
      />

      <MutationSubmitFeedback
        state={args.submitState}
        onRefreshConstraints={args.onRefreshConstraints}
      />

      <Group justify="end">
        <Button
          type="submit"
          loading={args.isSubmitting}
          disabled={args.isDisabled}
        >
          Save
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
  onRefreshConstraints?: () => Promise<void>;
}) {
  const { settings } = args;
  const isHydrated = useHydrated();
  const submitState = useDialogSubmitState({
    captureErrors: true,
    onRefreshConstraints: args.onRefreshConstraints,
  });
  const { isSubmitting, runSubmit, clearSubmissionError } = submitState;

  const form = useForm<SettingsFormValues>({
    mode: "controlled",
    initialValues: {
      name: settings.name,
      referenceCurrency: settings.referenceCurrency,
      startDate: settings.startDate,
    },
    validate: {
      name: (value) =>
        value.trim().length === 0
          ? "Account book name is required"
          : value.trim().length > RESOURCE_LIMITS.name
            ? "Name cannot exceed 255 characters."
            : null,
      referenceCurrency: (value) =>
        value ? null : "Reference currency is required",
      startDate: validateStartDate,
    },
  });
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    const currentForm = formRef.current;
    if (currentForm.isDirty()) return;
    currentForm.setValues({
      name: settings.name,
      referenceCurrency: settings.referenceCurrency,
      startDate: settings.startDate,
    });
    currentForm.resetDirty();
  }, [settings]);

  return (
    <NarrowPageShell>
      <VisuallyHidden component="div">
        <Title order={2}>General Settings</Title>
      </VisuallyHidden>

      <form
        onSubmit={form.onSubmit(async (values) => {
          const normalizedStartDate = normalizeDateInputValue(values.startDate);
          const referenceCurrency = values.referenceCurrency;
          if (!normalizedStartDate || !referenceCurrency) {
            return;
          }

          clearSubmissionError();
          await runSubmit(async () => {
            await args.onSubmit({
              name: values.name.trim(),
              referenceCurrency,
              startDate: startOfUtcDay(normalizedStartDate).toISOString(),
            });
            form.resetDirty();
            showSettingsSavedNotification();
          });
        })}
      >
        <SettingsFormFields
          form={form}
          isDisabled={!isHydrated || isSubmitting}
          isSubmitting={isSubmitting}
          submitState={submitState}
          onRefreshConstraints={args.onRefreshConstraints}
          settings={settings}
        />
      </form>
    </NarrowPageShell>
  );
}
