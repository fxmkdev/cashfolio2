import {
  Button,
  Group,
  SegmentedControl,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { isAfter, parse, startOfDay } from "date-fns";
import { useEffect } from "react";
import { AccountType, Unit } from "../.prisma-client/enums";
import { isExpenseAccount, isIncomeAccount } from "../shared/account-utils";
import type { AccountOption } from "./edit-transaction-modal";
import { FormattedNumberInput } from "./formatted-number-input";

type Direction = "DEBIT" | "CREDIT";

function getForcedDirection(
  account: AccountOption | undefined,
): Direction | null {
  if (isIncomeAccount(account)) return "DEBIT";
  if (isExpenseAccount(account)) return "CREDIT";
  return null;
}

export function SimpleTransactionModal({
  currentAccount,
  accounts,
  onClose,
  onSubmit,
}: {
  currentAccount: {
    unit: Unit | null;
    currency: string | null;
    cryptocurrency: string | null;
    symbol: string | null;
    tradeCurrency: string | null;
  };
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
    mode: "controlled",
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
        if (!value) return "Account is required";

        const counterAccount = accounts.find(
          (account) => account.value === value,
        );
        if (!counterAccount) return "Account is required";

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

  const selectedAccount = accounts.find(
    (account) => account.value === form.values.counterAccountId,
  );
  const forcedDirection = getForcedDirection(selectedAccount);
  const unitLabel = getUnitLabel(
    selectedAccount && selectedAccount.type !== AccountType.EQUITY
      ? selectedAccount
      : currentAccount,
  );

  useEffect(() => {
    if (forcedDirection && form.values.direction !== forcedDirection) {
      form.setFieldValue("direction", forcedDirection);
    }
  }, [forcedDirection, form.values.direction]);

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
            direction: forcedDirection ?? values.direction,
          });
        })(event)
      }
    >
      <Stack gap="md">
        <Group align="start" wrap="nowrap">
          <DateInput
            valueFormat="DD.MM.YYYY"
            dateParser={(value) => parse(value, "dd.MM.yyyy", new Date())}
            label="Date"
            w={180}
            {...form.getInputProps("date")}
          />
          <TextInput
            label="Description"
            flex={1}
            {...form.getInputProps("description")}
          />
        </Group>

        <Group align="end" wrap="nowrap">
          <Select
            label="Account"
            data={accounts.map((account) => ({
              value: account.value,
              label: account.label,
            }))}
            searchable
            flex={1}
            {...form.getInputProps("counterAccountId")}
          />
          <SegmentedControl
            data={[
              { value: "DEBIT", label: "Debit" },
              { value: "CREDIT", label: "Credit" },
            ]}
            disabled={forcedDirection !== null}
            mt={24}
            {...form.getInputProps("direction")}
          />
          <FormattedNumberInput
            label="Amount"
            decimalScale={2}
            allowNegative={false}
            hideControls
            locale="en-CH"
            w={220}
            leftSection={
              unitLabel ? (
                <span
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    fontSize: "0.68rem",
                    lineHeight: 1,
                    paddingLeft: "0.35rem",
                  }}
                >
                  {unitLabel}
                </span>
              ) : undefined
            }
            leftSectionWidth={82}
            {...form.getInputProps("amount")}
          />
        </Group>

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

function getUnitLabel(account: {
  unit?: Unit | null;
  currency?: string | null;
  cryptocurrency?: string | null;
  symbol?: string | null;
}): string | null {
  if (account.unit === Unit.CURRENCY) {
    return account.currency ?? null;
  }
  if (account.unit === Unit.CRYPTOCURRENCY) {
    return account.cryptocurrency ?? null;
  }
  if (account.unit === Unit.SECURITY) {
    return account.symbol ?? null;
  }
  return null;
}
