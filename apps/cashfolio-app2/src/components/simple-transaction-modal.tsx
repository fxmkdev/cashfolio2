import {
  Button,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { isAfter, parse, startOfDay } from "date-fns";
import { isExpenseAccount, isIncomeAccount } from "../shared/account-utils";
import type { AccountOption } from "./edit-transaction-modal";
import { FormattedNumberInput } from "./formatted-number-input";

type Direction = "DEBIT" | "CREDIT";

export function SimpleTransactionModal({
  accountName,
  accounts,
  onClose,
  onSubmit,
}: {
  accountName: string;
  accounts: AccountOption[];
  onClose: () => void;
  onSubmit: (values: {
    date: string;
    description: string;
    counterAccountId: string;
    amount: number;
    direction: Direction;
  }) => Promise<void>;
}) {
  const today = startOfDay(new Date());

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      date: today,
      description: "",
      counterAccountId: "",
      amount: undefined as string | number | undefined,
      direction: "DEBIT" as Direction,
    },
    validate: {
      date: (value) => {
        if (!value) return "Date is required";
        if (isAfter(startOfDay(value), today)) {
          return "Date cannot be in the future";
        }
        return null;
      },
      counterAccountId: (value, values) => {
        if (!value) return "Counter account is required";

        const counterAccount = accounts.find(
          (account) => account.value === value,
        );
        if (!counterAccount) return "Counter account is required";

        if (values.direction === "DEBIT" && isExpenseAccount(counterAccount)) {
          return "Expense accounts cannot be credited";
        }

        if (values.direction === "CREDIT" && isIncomeAccount(counterAccount)) {
          return "Income accounts cannot be debited";
        }

        return null;
      },
      amount: (value) => {
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount <= 0) {
          return "Amount must be greater than zero";
        }
        return null;
      },
    },
  });

  return (
    <form
      onSubmit={(event) =>
        form.onSubmit(async (values) => {
          const date = values.date ?? today;
          await onSubmit({
            date: date.toISOString(),
            description: values.description,
            counterAccountId: values.counterAccountId,
            amount: Number(values.amount),
            direction: values.direction,
          });
        })(event)
      }
    >
      <Stack gap="md">
        <DateInput
          valueFormat="DD.MM.YYYY"
          dateParser={(value) => parse(value, "dd.MM.yyyy", new Date())}
          label="Date"
          {...form.getInputProps("date")}
        />

        <TextInput label="Description" {...form.getInputProps("description")} />

        <Select
          label="Counter account"
          data={accounts.map((account) => ({
            value: account.value,
            label: account.label,
          }))}
          searchable
          {...form.getInputProps("counterAccountId")}
        />

        <Group grow align="end">
          <SegmentedControl
            data={[
              { value: "DEBIT", label: "Debit" },
              { value: "CREDIT", label: "Credit" },
            ]}
            {...form.getInputProps("direction")}
          />
          <FormattedNumberInput
            label="Amount"
            decimalScale={2}
            allowNegative={false}
            hideControls
            locale="en-CH"
            {...form.getInputProps("amount")}
          />
        </Group>
        <Text size="sm" c="dimmed">
          Debit/Credit applies to {accountName}.
        </Text>

        <Group justify="end">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Create</Button>
        </Group>
      </Stack>
    </form>
  );
}
