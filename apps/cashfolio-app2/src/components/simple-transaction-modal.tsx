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
import { isAfter, startOfDay } from "date-fns";
import { useEffect } from "react";
import { IconArrowRight } from "@tabler/icons-react";
import {
  isExpenseAccount,
  isIncomeAccount,
  isOpeningBalancesAccount,
} from "../shared/account-utils";
import {
  formatUtcDateForLocale,
  getDateInputValueFormat,
  normalizeDateInputValue,
  startOfUtcDay,
} from "../shared/date";
import { useDialogSubmitState } from "../hooks/use-dialog-submit-state";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "../shared/opening-balances";
import type { AccountOption } from "./edit-transaction-modal";
import { AccountTreeSelect } from "./account-tree-select";
import { FormattedNumberInput } from "./formatted-number-input";
import { useUserLocale } from "@/user-locale-context";

export type SimpleTransactionDirection = "DEBIT" | "CREDIT";

export type SimpleTransactionInitialValues = {
  date: Date;
  description: string;
  counterAccountId: string;
  amount: number;
  direction: SimpleTransactionDirection;
};

export type SimpleTransactionDraftValues = {
  date: Date | string | null;
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
  accountBookStartDate,
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
  accountBookStartDate: Date;
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
  const userLocale = useUserLocale();
  const today = startOfDay(new Date());
  const accountBookStartDay = startOfUtcDay(accountBookStartDate);
  const accountBookStartDateLabel = formatUtcDateForLocale(
    accountBookStartDay,
    userLocale,
  );
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
      date: (value, values) => {
        const date = normalizeDateInputValue(value);
        if (!date) {
          return value ? "Date is invalid" : "Date is required";
        }
        if (startOfUtcDay(date) < accountBookStartDay) {
          return `Date cannot be before account book start date (${accountBookStartDateLabel}).`;
        }
        if (isAfter(startOfDay(date), today)) {
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
        if (isOpeningBalancesAccount(counterAccount)) {
          return OPENING_BALANCES_MANAGEMENT_MESSAGE;
        }

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
              const date = normalizeDateInputValue(values.date) ?? today;
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
            valueFormat={getDateInputValueFormat(userLocale)}
            dateParser={(value) => normalizeDateInputValue(value, userLocale)}
            label="Date"
            w={180}
            minDate={accountBookStartDay}
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
            allowNegative={false}
            hideControls
            w={220}
            disabled={isSubmitting}
            {...form.getInputProps("amount")}
          />
        </Group>

        <Group align="end" wrap="wrap">
          <Select
            label="Current Account"
            data={[{ value: currentAccount.id, label: currentAccount.label }]}
            value={currentAccount.id}
            disabled
            style={{ flex: "1 1 16rem" }}
          />

          <Tooltip
            label={forcedDirectionReason ?? "Swap Debit/Credit Direction"}
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
                aria-label="Swap Debit/Credit Direction"
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

          <AccountTreeSelect
            label="Counter Account"
            accounts={accounts}
            style={{ flex: "1 1 16rem" }}
            disabled={isSubmitting}
            value={form.values.counterAccountId || null}
            error={form.errors.counterAccountId}
            onChange={(value) =>
              form.setFieldValue("counterAccountId", value ?? "")
            }
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
                  date: normalizeDateInputValue(form.values.date),
                  description: form.values.description,
                  counterAccountId: form.values.counterAccountId,
                  amount: form.values.amount,
                  direction: forcedDirection ?? form.values.direction,
                })
              }
            >
              Switch to Split Editor
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
