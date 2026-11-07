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
import type { UseFormReturnType } from "@mantine/form";
import { IconPlus } from "@tabler/icons-react";
import type { FormEventHandler, ReactNode } from "react";
import {
  getDateInputValueFormat,
  normalizeDateInputValue,
} from "@/shared/date";
import type { UserLocale } from "@/user-locale";
import type { NewAccountBookFormValues } from "./-use-new-account-book-form";

export type NewAccountBookPageViewProps = {
  form: UseFormReturnType<NewAccountBookFormValues>;
  userLocale: UserLocale;
  currencyOptions: { value: string; label: string }[];
  actions: ReactNode;
  maxDate: Date;
  isSubmitting: boolean;
  submitError: string | null;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export function NewAccountBookPageView({
  form,
  userLocale,
  currencyOptions,
  actions,
  maxDate,
  isSubmitting,
  submitError,
  onSubmit,
}: NewAccountBookPageViewProps) {
  return (
    <Container size="xs" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={2}>Create Account Book</Title>
          {actions}
        </Group>

        <form onSubmit={onSubmit}>
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
              valueFormat={getDateInputValueFormat(userLocale)}
              dateParser={(value) => normalizeDateInputValue(value, userLocale)}
              label="Start Date"
              withAsterisk
              maxDate={maxDate}
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
