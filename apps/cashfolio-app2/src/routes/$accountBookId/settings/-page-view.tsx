import {
  Button,
  Container,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { parse } from "date-fns";
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

  const currencyOptions = useMemo(
    () =>
      Object.entries(currencies)
        .map(([code, label]) => ({
          value: code,
          label: `${code} - ${label}`,
        }))
        .sort((left, right) => left.value.localeCompare(right.value)),
    [],
  );

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
      startDate: (value) => {
        const startDate = normalizeDateInputValue(value);
        if (!startDate) {
          return value ? "Start date is invalid" : "Start date is required";
        }

        const startDay = startOfUtcDay(startDate);
        if (startDay > startOfUtcDay(new Date())) {
          return "Start date cannot be in the future";
        }

        return null;
      },
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
    <Container py="xl" size="sm">
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
              notifications.show({
                color: "green",
                icon: <IconCheck size={16} />,
                title: "Saved",
                message: "Account book settings saved.",
              });
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
        <Stack gap="md">
          <TextInput
            label="Account Book Name"
            withAsterisk
            disabled={isSubmitting}
            {...form.getInputProps("name")}
          />

          <Select
            label="Reference Currency"
            withAsterisk
            searchable
            allowDeselect={false}
            disabled={isSubmitting}
            data={currencyOptions}
            {...form.getInputProps("referenceCurrency")}
          />

          <DateInput
            valueFormat="DD.MM.YYYY"
            dateParser={(value) => parse(value, "dd.MM.yyyy", new Date())}
            label="Start Date"
            withAsterisk
            maxDate={startOfUtcDay(new Date())}
            disabled={isSubmitting}
            {...form.getInputProps("startDate")}
          />

          {submitError && (
            <Text size="sm" c="red">
              {submitError}
            </Text>
          )}

          <Group justify="end">
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Container>
  );
}
