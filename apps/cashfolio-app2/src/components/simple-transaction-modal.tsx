import { MutationSubmitFeedback } from "./mutation-submit-feedback";
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
import { startOfDay } from "date-fns";
import { useEffect, useRef } from "react";
import { IconArrowRight } from "@tabler/icons-react";
import {
  isExpenseAccount,
  isIncomeAccount,
  isOpeningBalancesAccount,
} from "../shared/account-utils";
import {
  formatDateInputValueAsUtcDayIsoString,
  formatUtcDateForLocale,
  getDateInputValueFormat,
  normalizeDateInputValue,
  normalizeDateInputValueToUtcDay,
  startOfUtcDay,
} from "../shared/date";
import { useDialogSubmitState } from "../hooks/use-dialog-submit-state";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "../shared/opening-balances";
import type { AccountOption } from "@/shared/account-options";
import { AccountTreeSelect } from "./account-tree-select";
import { FormattedNumberInput } from "./formatted-number-input";
import { useUserLocale } from "@/user-locale-context";

export type SimpleTransactionDirection = "DEBIT" | "CREDIT";

export type SimpleTransactionInitialValues = {
  date?: Date;
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

export function createSimpleTransactionFormInitialValues(args: {
  initialValues?: SimpleTransactionInitialValues;
  today: Date;
}) {
  return {
    date: args.initialValues ? args.initialValues.date : args.today,
    description: args.initialValues?.description ?? "",
    counterAccountId: args.initialValues?.counterAccountId ?? "",
    amount:
      args.initialValues?.amount ?? (undefined as string | number | undefined),
    direction:
      args.initialValues?.direction ?? ("DEBIT" as SimpleTransactionDirection),
  };
}

export function toSimpleTransactionSubmitDate(
  value: Date | string | null | undefined,
  fallback: Date,
): string {
  return (
    formatDateInputValueAsUtcDayIsoString(value) ||
    formatDateInputValueAsUtcDayIsoString(fallback)
  );
}

export function SimpleTransactionModal({
  currentAccount,
  accounts,
  accountBookStartDate,
  initialValues,
  autoFocusDate,
  submitLabel,
  onSwitchToSplit,
  onClose,
  onSubmittingChange,
  onSubmit,
  onRefreshConstraints,
}: {
  currentAccount: {
    id: string;
    label: string;
  };
  accounts: AccountOption[];
  accountBookStartDate: Date;
  initialValues?: SimpleTransactionInitialValues;
  autoFocusDate?: boolean;
  submitLabel?: string;
  onSwitchToSplit?: (draft: SimpleTransactionDraftValues) => void;
  onClose: () => void;
  onRefreshConstraints?: () => Promise<void>;
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
  const submitState = useDialogSubmitState({
    onSubmittingChange,
    captureErrors: true,
    onRefreshConstraints,
  });
  const { isSubmitting, runSubmit } = submitState;

  const form = useForm({
    mode: "controlled",
    initialValues: createSimpleTransactionFormInitialValues({
      initialValues,
      today,
    }),
    validate: {
      date: (value) => {
        const date = normalizeDateInputValueToUtcDay(value, userLocale);
        if (!date) {
          return value ? "Date is invalid" : "Date is required";
        }
        if (startOfUtcDay(date) < accountBookStartDay) {
          return `Date cannot be before account book start date (${accountBookStartDateLabel}).`;
        }
        return null;
      },
      counterAccountId: (value, values) => {
        if (!value) return "Counter account is required";

        const counterAccount = accounts.find(
          (account) => account.value === value,
        );
        if (!counterAccount)
          return value
            ? "The selected account is no longer available. Choose another account."
            : "Counter account is required";
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
  const formRef = useRef(form);
  formRef.current = form;

  const selectedAccount = accounts.find(
    (account) => account.value === form.values.counterAccountId,
  );
  const currentDirection = form.values.direction;
  const forcedDirection = getForcedDirection(selectedAccount);
  const forcedDirectionReason =
    forcedDirection === "DEBIT"
      ? "Income accounts require current account debit."
      : forcedDirection === "CREDIT"
        ? "Expense accounts require current account credit."
        : null;

  useEffect(() => {
    if (forcedDirection && currentDirection !== forcedDirection) {
      formRef.current.setFieldValue("direction", forcedDirection);
    }
  }, [currentDirection, forcedDirection]);

  return (
    <form
      onSubmit={(event) =>
        form.onSubmit(
          (values) =>
            runSubmit(async () => {
              await onSubmit({
                date: toSimpleTransactionSubmitDate(values.date, today),
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
        <MutationSubmitFeedback
          state={submitState}
          onRefreshConstraints={onRefreshConstraints}
        />
        <Group align="start" wrap="nowrap">
          <DateInput
            valueFormat={getDateInputValueFormat(userLocale)}
            dateParser={(value) => normalizeDateInputValue(value, userLocale)}
            label="Date"
            w={180}
            minDate={accountBookStartDay}
            disabled={isSubmitting}
            data-autofocus={autoFocusDate || undefined}
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
                  date: form.values.date ?? null,
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
