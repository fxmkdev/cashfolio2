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
import { useDialogSubmitState } from "../hooks/use-dialog-submit-state";
import type { AccountOption } from "./edit-transaction-modal";
import { FormattedNumberInput } from "./formatted-number-input";

export type SimpleTransactionDirection = "DEBIT" | "CREDIT";

export type SimpleTransactionInitialValues = {
  date: Date;
  description: string;
  counterAccountId: string;
  amount: number;
  direction: SimpleTransactionDirection;
};

export type SimpleTransactionDraftValues = {
  date: Date | null;
  description: string;
  counterAccountId: string;
  amount: string | number | undefined;
  direction: SimpleTransactionDirection;
};

function getForcedDirection(
  account: AccountOption | undefined,
): SimpleTransactionDirection | null {
  if (isIncomeAccount(account)) return "DEBIT";
  if (isExpenseAccount(account)) return "CREDIT";
  return null;
}

export function SimpleTransactionModal({
  currentAccount,
  accounts,
  initialValues,
  submitLabel,
  onSwitchToSplit,
  onClose,
  onSubmittingChange,
  onSubmit,
}: {
  currentAccount: {
    id: string;
    label: string;
  };
  accounts: AccountOption[];
  initialValues?: SimpleTransactionInitialValues;
  submitLabel?: string;
  onSwitchToSplit?: (draft: SimpleTransactionDraftValues) => void;
  onClose: () => void;
  onSubmittingChange?: (isSubmitting: boolean) => void;
  onSubmit: (values: {
    date: string;
    description: string;
    counterAccountId: string;
    amount: number;
    direction: SimpleTransactionDirection;
  }) => Promise<void>;
}) {
  const today = startOfDay(new Date());
  const { isSubmitting, runSubmit } = useDialogSubmitState({
    onSubmittingChange,
  });

  const form = useForm({
    mode: "controlled",
    initialValues: {
      date: initialValues?.date ?? today,
      description: initialValues?.description ?? "",
      counterAccountId: initialValues?.counterAccountId ?? "",
      amount:
        initialValues?.amount ?? (undefined as string | number | undefined),
      direction:
        initialValues?.direction ?? ("DEBIT" as SimpleTransactionDirection),
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
        form.onSubmit(
          (values) =>
            runSubmit(async () => {
              const date = values.date ?? today;
              await onSubmit({
                date: date.toISOString(),
                description: values.description,
                counterAccountId: values.counterAccountId,
                amount: Number(values.amount),
                direction: forcedDirection ?? values.direction,
              });
            }),
          console.error,
        )(event)
      }
    >
      <Stack gap="md">
        <Group align="start" wrap="nowrap">
          <DateInput
            valueFormat="DD.MM.YYYY"
            dateParser={(value) => parse(value, "dd.MM.yyyy", new Date())}
            label="Date"
            w={180}
            disabled={isSubmitting}
            {...form.getInputProps("date")}
          />
          <TextInput
            label="Description"
            flex={1}
            disabled={isSubmitting}
            {...form.getInputProps("description")}
          />
          <FormattedNumberInput
            label="Amount"
            decimalScale={2}
            allowNegative={false}
            hideControls
            locale="en-CH"
            w={220}
            disabled={isSubmitting}
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
                disabled={isSubmitting || forcedDirection !== null}
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
            disabled={isSubmitting}
            {...form.getInputProps("counterAccountId")}
          />
        </Group>

        <Group justify="end">
          {onSwitchToSplit && (
            <Button
              type="button"
              variant="default"
              mr="auto"
              disabled={isSubmitting}
              onClick={() =>
                onSwitchToSplit({
                  date: form.values.date ?? null,
                  description: form.values.description,
                  counterAccountId: form.values.counterAccountId,
                  amount: form.values.amount,
                  direction: forcedDirection ?? form.values.direction,
                })
              }
            >
              Switch to split editor
            </Button>
          )}
          <Button variant="subtle" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
            {submitLabel ?? (initialValues ? "Save" : "Create")}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
