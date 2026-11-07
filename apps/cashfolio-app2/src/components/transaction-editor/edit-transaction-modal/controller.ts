import { useEffect, type FormEvent } from "react";
import { startOfUtcDay } from "@/shared/date";
import { useUserLocale } from "@/user-locale-context";
import type { EditTransactionModalProps } from "../edit-transaction-modal-types";
import { submitTransactionForm, useEditTransactionForm } from "./form";
import { useEditTransactionGrid } from "./grid";

export function useEditTransactionModalController(
  props: EditTransactionModalProps,
) {
  const userLocale = useUserLocale();
  const accountBookStartDay = startOfUtcDay(props.accountBookStartDate);
  const formState = useEditTransactionForm(
    props,
    userLocale,
    accountBookStartDay,
  );
  const grid = useEditTransactionGrid({
    form: formState.form,
    accounts: props.accounts,
    currentAccountId: props.currentAccountId,
    unitUsage: props.unitUsage,
    accountBookStartDay,
    isSubmitting: formState.submitState.isSubmitting,
  });
  const { isFormDirty, isDateInputDirty } = formState;
  const { isCellEditorDirty } = grid;
  const onDirtyChange = props.onDirtyChange;
  useEffect(() => {
    onDirtyChange?.(isFormDirty || isCellEditorDirty || isDateInputDirty);
  }, [isFormDirty, isCellEditorDirty, isDateInputDirty, onDirtyChange]);

  return {
    props,
    ...formState,
    grid,
    userLocale,
    accountBookStartDay,
    handleSubmit: (event: FormEvent<HTMLFormElement>) =>
      submitTransactionForm({
        form: formState.form,
        runSubmit: formState.submitState.runSubmit,
        onSubmit: props.onSubmit,
        stopEditing: () => grid.gridRef.current?.api.stopEditing(),
        event,
      }),
  };
}
