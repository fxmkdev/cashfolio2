import { useState, type FormEvent } from "react";
import { useForm } from "@mantine/form";
import type { DateInputProps } from "@mantine/dates";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import {
  normalizeDateInputValue,
  normalizeDateInputValueToUtcDay,
} from "@/shared/date";
import {
  createTransactionFormInitialValues,
  toTransactionSubmitBookings,
} from "../edit-transaction-modal-values";
import { isTransactionFormDirty } from "../edit-transaction-modal-dirty-state";
import { createEditTransactionValidation } from "../edit-transaction-modal-validation";
import type {
  EditTransactionModalProps,
  TransactionForm,
  TransactionFormValues,
} from "../edit-transaction-modal-types";

export function propagateTransactionDate(args: {
  form: Pick<TransactionForm, "values" | "setFieldValue">;
  date: Date | string | null | undefined;
  previousDate: Date | string | null | undefined;
  locale: string;
}) {
  const { form, date, previousDate, locale } = args;
  if (
    normalizeDateInputValueToUtcDay(date, locale)?.getTime() ===
    normalizeDateInputValueToUtcDay(previousDate, locale)?.getTime()
  )
    return;
  const normalizedDate = normalizeDateInputValue(date, locale);
  if (date != null && normalizedDate == null) return;
  for (let i = 0; i < form.values.bookings.length; i++) {
    form.setFieldValue(`bookings.${i}.date`, normalizedDate ?? undefined);
  }
}

function useTransactionDateInput(form: TransactionForm, locale: string) {
  const [isDateInputDirty, setIsDateInputDirty] = useState(false);
  const dateInputHandlers: Pick<
    DateInputProps,
    "onInput" | "onChange" | "onBlur"
  > = {
    onInput: (event) => {
      const input = event.currentTarget.value;
      const date = normalizeDateInputValueToUtcDay(input, locale);
      const initialDate = normalizeDateInputValueToUtcDay(
        form.getInitialValues().date,
        locale,
      );
      setIsDateInputDirty(
        date?.getTime() !== initialDate?.getTime() || (input !== "" && !date),
      );
    },
    onChange: (nextDate) => {
      setIsDateInputDirty(false);
      form.getInputProps("date").onChange(nextDate);
    },
    onBlur: (event) => {
      // DateInput restores provisional text on blur without onChange.
      setIsDateInputDirty(false);
      form.getInputProps("date").onBlur(event);
    },
  };
  return { isDateInputDirty, dateInputHandlers };
}

export function useEditTransactionForm(
  props: EditTransactionModalProps,
  locale: string,
  accountBookStartDay: Date,
) {
  const submitState = useDialogSubmitState({
    onSubmittingChange: props.onSubmittingChange,
    captureErrors: true,
    onRefreshConstraints: props.onRefreshConstraints,
  });
  const [isFormDirty, setIsFormDirty] = useState(false);
  const form = useForm<TransactionFormValues>({
    mode: "uncontrolled",
    initialValues: createTransactionFormInitialValues({
      initialValues: props.initialValues,
      currentAccountId: props.currentAccountId,
      currentAccount: props.accounts.find(
        (account) => account.value === props.currentAccountId,
      ),
    }),
    onValuesChange: ({ date }, { date: previousDate }) => {
      setIsFormDirty(
        isTransactionFormDirty(
          form.getValues(),
          form.getInitialValues(),
          locale,
        ),
      );
      propagateTransactionDate({ form, date, previousDate, locale });
    },
    validate: createEditTransactionValidation({
      accounts: props.accounts,
      accountBookStartDay,
      locale,
    }),
  });
  return {
    form,
    submitState,
    isFormDirty,
    ...useTransactionDateInput(form, locale),
  };
}

export async function submitTransactionForm(args: {
  form: Pick<TransactionForm, "onSubmit">;
  runSubmit: ReturnType<typeof useDialogSubmitState>["runSubmit"];
  onSubmit: EditTransactionModalProps["onSubmit"];
  stopEditing: () => void | Promise<void>;
  event?: FormEvent<HTMLFormElement>;
}) {
  args.event?.preventDefault();
  await args.stopEditing();
  return args.form.onSubmit(
    (values) =>
      args.runSubmit(() =>
        args.onSubmit({
          description: values.description ?? "",
          bookings: toTransactionSubmitBookings(values.bookings),
        }),
      ),
    console.error,
  )(args.event);
}
