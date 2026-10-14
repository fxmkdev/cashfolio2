import {
  type EditAccountModalProps,
  type FormValues,
  type TransformedFormValues,
} from "./types";
import { useId, useReducer, useRef, useMemo, useEffect } from "react";
import { useDialogSubmitState } from "../../hooks/use-dialog-submit-state";
import { useForm, isNotEmpty } from "@mantine/form";
import {
  toFormValues,
  transformAccountValues,
  validateStatementImportCsvFormatFormValue,
} from "./values";
import { Unit, AccountType } from "../../.prisma-client/enums";
import {
  validateAccountName,
  validateAccountUnit,
  validateAccountCurrency,
  validateAccountCryptocurrency,
  validateAccountSymbol,
  validateAccountTradeCurrency,
} from "../../shared/account-validation";
import {
  getAccountCashParentCompatibilityError,
  isRootCashAccountEditable,
  getCashAccountDisabledReason,
  resolveAccountCashAccountFormValue,
  applyAccountGroupCashInheritance,
} from "./account-cash-form-rules";

export function useEditAccountModalController({
  opened,
  onClose,
  accountGroups,
  onSubmit,
  onRefreshConstraints,
  initialValues,
  existingNodes,
  editingId,
  typeDescriptor,
}: EditAccountModalProps) {
  const isEdit = !!initialValues;
  const statementImportCsvFormatInputId = useId();
  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  const submitState = useDialogSubmitState({
    captureErrors: true,
    onRefreshConstraints,
  });
  const { isSubmitting, runSubmit, clearSubmissionError } = submitState;
  const form = useForm<FormValues, TransformedFormValues>({
    mode: "uncontrolled",
    initialValues: initialValues
      ? toFormValues(initialValues)
      : { unit: Unit.CURRENCY, typeDescriptor },
    validate: {
      name: (value, values) => {
        const siblingNames = existingNodes
          ?.filter(
            (n) =>
              n.nodeType === "account" &&
              n.groupId === values.groupId &&
              n.id !== editingId,
          )
          .map((n) => n.name);
        return validateAccountName(value, siblingNames);
      },
      typeDescriptor: isNotEmpty("Type is required"),
      groupId: (value, values) =>
        (value && !accountGroups.some((group) => group.value === value)
          ? "The selected group is no longer available. Choose another group or clear the selection."
          : null) ??
        getAccountCashParentCompatibilityError({
          accountType: transformAccountValues(values).type,
          accountUnit: values.unit,
          groupId: value,
          accountGroups,
        }),
      openingBalance: (value, values) => {
        if (
          values.typeDescriptor !== AccountType.ASSET &&
          values.typeDescriptor !== AccountType.LIABILITY
        ) {
          return null;
        }
        if (value == null || value === "") {
          return null;
        }
        return Number.isFinite(Number(value))
          ? null
          : "Opening balance is invalid";
      },
      unit: (value, values) =>
        validateAccountUnit(value, values.typeDescriptor as AccountType),
      currency: (value, values) =>
        validateAccountCurrency(
          value,
          values.unit,
          values.typeDescriptor as AccountType,
        ),
      cryptocurrency: (value, values) =>
        validateAccountCryptocurrency(
          value,
          values.unit,
          values.typeDescriptor as AccountType,
        ),
      symbol: (value, values) =>
        validateAccountSymbol(
          value,
          values.unit,
          values.typeDescriptor as AccountType,
        ),
      tradeCurrency: (value, values) =>
        validateAccountTradeCurrency(
          value,
          values.unit,
          values.typeDescriptor as AccountType,
        ),
      statementImportCsvFormat: (value, values) =>
        validateStatementImportCsvFormatFormValue(value, values.typeDescriptor),
    },
    transformValues: transformAccountValues,
    onValuesChange: (values: FormValues, previous: FormValues) => {
      if (
        values.unit !== previous.unit ||
        values.typeDescriptor !== previous.typeDescriptor ||
        values.groupId !== previous.groupId
      ) {
        clearSubmissionError();
        forceUpdate();
      }
    },
  });
  const formRef = useRef(form);
  formRef.current = form;
  const resetInitialValues = useMemo(
    () =>
      initialValues
        ? toFormValues(initialValues)
        : { unit: Unit.CURRENCY, typeDescriptor },
    [initialValues, typeDescriptor],
  );

  const initializedSession = useRef<string | null>(null);
  useEffect(() => {
    if (!opened) {
      initializedSession.current = null;
      return;
    }
    const session = `${editingId ?? "create"}/${typeDescriptor}`;
    if (initializedSession.current !== session) {
      initializedSession.current = session;
      const currentForm = formRef.current;
      currentForm.setInitialValues(resetInitialValues);
      currentForm.reset();
      clearSubmissionError();
      forceUpdate();
    }
  }, [
    opened,
    editingId,
    typeDescriptor,
    resetInitialValues,
    clearSubmissionError,
  ]);

  const { unit, type, equityAccountSubtype } = transformAccountValues(
    form.getValues(),
  );
  const canMarkAsCashAccount =
    type === AccountType.ASSET && unit === Unit.CURRENCY;
  const groupId = form.getValues().groupId;
  const cashAccountEditable = isRootCashAccountEditable({
    type,
    unit,
    groupId,
  });
  const cashAccountDisabledReason = getCashAccountDisabledReason({
    type,
    unit,
    groupId,
  });
  const cashAccountValue = resolveAccountCashAccountFormValue({
    type,
    unit,
    groupId,
    isCashAccount: form.getValues().isCashAccount,
    accountGroups,
  });
  const unitIdentityDisabled = isEdit;
  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleSubmit = form.onSubmit((values) => {
    clearSubmissionError();
    return runSubmit(async () => {
      await onSubmit(applyAccountGroupCashInheritance(values, accountGroups));
    });
  });
  return {
    form,
    submitState,
    isSubmitting,
    isEdit,
    statementImportCsvFormatInputId,
    unit,
    type,
    equityAccountSubtype,
    canMarkAsCashAccount,
    cashAccountEditable,
    cashAccountDisabledReason,
    cashAccountValue,
    unitIdentityDisabled,
    handleClose,
    handleSubmit,
  };
}
