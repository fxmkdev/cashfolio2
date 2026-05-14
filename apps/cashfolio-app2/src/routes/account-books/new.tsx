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
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { currencies } from "@/currencies";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import { createAccountBook } from "@/server/account-books";
import { normalizeDateInputValue, startOfUtcDay } from "@/shared/date";
import { invalidateCachedUserAccountBooks } from "../$accountBookId/-account-book-options-loader";
import { NewAccountBookSignOutForm } from "./-new-account-book-sign-out-form";

type NewAccountBookFormValues = {
  name: string;
  referenceCurrency: string | null;
  startDate: Date | string | null;
};

export const Route = createFileRoute("/account-books/new")({
  component: NewAccountBookPage,
});

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

function showAccountBookCreatedNotification() {
  notifications.show({
    color: "green",
    icon: <IconCheck size={16} />,
    title: "Created",
    message: "Account book created.",
    withBorder: true,
  });
}

function NewAccountBookPage() {
  const navigate = useNavigate({ from: "/account-books/new" });
  const { isSubmitting, runSubmit } = useDialogSubmitState();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const currencyOptions = useMemo(() => getCurrencyOptions(), []);

  const form = useForm<NewAccountBookFormValues>({
    mode: "controlled",
    initialValues: {
      name: "",
      referenceCurrency: "CHF",
      startDate: startOfUtcDay(new Date()),
    },
    validate: {
      name: (value) =>
        value.trim().length === 0 ? "Account book name is required" : null,
      referenceCurrency: (value) =>
        value ? null : "Reference currency is required",
      startDate: validateStartDate,
    },
  });

  return (
    <Container size="xs" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={2}>Create Account Book</Title>
          <NewAccountBookSignOutForm />
        </Group>

        <form
          onSubmit={form.onSubmit(async (values) => {
            const normalizedStartDate = normalizeDateInputValue(
              values.startDate,
            );
            const referenceCurrency = values.referenceCurrency;
            if (!normalizedStartDate || !referenceCurrency) {
              return;
            }

            setSubmitError(null);
            await runSubmit(async () => {
              try {
                const created = await createAccountBook({
                  data: {
                    name: values.name.trim(),
                    referenceCurrency,
                    startDate: startOfUtcDay(normalizedStartDate).toISOString(),
                  },
                });

                invalidateCachedUserAccountBooks();
                showAccountBookCreatedNotification();
                await navigate({
                  to: "/$accountBookId/accounts",
                  params: { accountBookId: created.id },
                  search: { tab: "ASSET", mode: "active" },
                });
              } catch (error) {
                setSubmitError(
                  error instanceof Error
                    ? error.message
                    : "Failed to create account book.",
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
              dateParser={(value) => normalizeDateInputValue(value)}
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
                leftSection={<IconPlus size={16} />}
              >
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}
