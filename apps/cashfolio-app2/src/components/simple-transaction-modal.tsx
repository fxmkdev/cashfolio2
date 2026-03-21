import {
  ActionIcon,
  Button,
  Group,
  Select,
  Stack,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { isAfter, parse, startOfDay } from "date-fns";
import { useEffect } from "react";
import { IconArrowRight } from "@tabler/icons-react";
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
    id: string;
    label: string;
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
        if (isNaN(value.getTime())) return "Date is invalid";
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

        const effectiveDirection =
          getForcedDirection(counterAccount) ?? values.direction;

        if (
          effectiveDirection === "DEBIT" &&
          isExpenseAccount(counterAccount)
        ) {
          return "Expense accounts cannot be credited";
        }

        if (
          effectiveDirection === "CREDIT" &&
          isIncomeAccount(counterAccount)
        ) {
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
  const forcedDirectionReason =
    forcedDirection === "DEBIT"
      ? "Income accounts require current account debit."
      : forcedDirection === "CREDIT"
        ? "Expense accounts require current account credit."
        : null;

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
        }, console.error)(event)
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
          <FormattedNumberInput
            label="Amount"
            decimalScale={2}
            allowNegative={false}
            hideControls
            locale="en-CH"
            w={220}
            {...form.getInputProps("amount")}
          />
        </Group>

        <Group align="end" wrap="wrap">
          <Select
            label="Current account"
            data={[{ value: currentAccount.id, label: currentAccount.label }]}
            value={currentAccount.id}
            disabled
            style={{ flex: "1 1 16rem" }}
          />

          <Tooltip
            label={forcedDirectionReason ?? "Swap debit/credit direction"}
          >
            <span>
              <ActionIcon
                mt={24}
                variant="default"
                size="lg"
                disabled={forcedDirection !== null}
                onClick={() =>
                  form.setFieldValue(
                    "direction",
                    form.values.direction === "DEBIT" ? "CREDIT" : "DEBIT",
                  )
                }
                aria-label="Swap debit/credit direction"
              >
                <IconArrowRight
                  size={18}
                  style={{
                    transform:
                      form.values.direction === "CREDIT"
                        ? undefined
                        : "rotate(180deg)",
                  }}
                />
              </ActionIcon>
            </span>
          </Tooltip>

          <Select
            label="Counter account"
            data={accounts.map((account) => ({
              value: account.value,
              label: account.label,
            }))}
            searchable
            style={{ flex: "1 1 16rem" }}
            {...form.getInputProps("counterAccountId")}
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
