import { useEffect, useReducer, useRef } from "react";
import type { SimpleTransactionDraftValues } from "@/components/transactions/simple-transaction-modal";
import { createCopyTransactionInitialValues } from "@/components/transaction-editor/edit-transaction-modal-values";
import { deriveSimpleTransactionEditState } from "./page-data";
import {
  createEditTransactionPatchFromSimpleDraft,
  createSplitInitialValuesFromSimpleDraft,
} from "./page-edit-flow";
import { createCopySimpleTransactionInitialValues } from "./page-transaction-utils";
import {
  createLatestTransactionRequest,
  transactionWorkflowReducer,
  type TransactionFlow,
  type TransactionFlowEvent,
  type LoadedTransaction,
} from "./transaction-workflow";

type ScopedEvent = { scope: object; event: TransactionFlowEvent };
function scopedReducer(
  state: { scope: object; flow: TransactionFlow },
  action: ScopedEvent,
) {
  return {
    scope: action.scope,
    flow: transactionWorkflowReducer(
      state.scope === action.scope ? state.flow : { kind: "idle" },
      action.event,
    ),
  };
}

export function useTransactionWorkflow(scope: string, accountId: string) {
  const request = useRef<ReturnType<
    typeof createLatestTransactionRequest
  > | null>(null);
  request.current ??= createLatestTransactionRequest();
  const latest = request.current;
  const scopeToken = latest.setScope(scope);
  const [stored, reduce] = useReducer(scopedReducer, {
    scope: scopeToken,
    flow: { kind: "idle" },
  });
  useEffect(
    () => () => {
      if (latest.hasScope(scopeToken)) latest.cancel();
    },
    [latest, scopeToken],
  );
  const sequence = useRef(0);
  const flow: TransactionFlow =
    stored.scope === scopeToken ? stored.flow : { kind: "idle" };
  const dispatch = (event: TransactionFlowEvent) => {
    if (latest.hasScope(scopeToken)) reduce({ scope: scopeToken, event });
  };
  const active =
    flow.kind !== "idle" && flow.kind !== "loading" ? flow : undefined;
  const createSimple = flow.kind === "createSimple" ? flow : undefined;
  const createSplit = flow.kind === "createSplit" ? flow : undefined;
  const edit =
    flow.kind === "editSimple" || flow.kind === "editSplit" ? flow : undefined;
  const show = (next: TransactionFlow) => {
    if (!latest.hasScope(scopeToken)) return;
    latest.cancel();
    dispatch({ type: "show", flow: next });
  };
  const close = (dialog?: "createSimple" | "createSplit" | "edit") => {
    if (active)
      dispatch({
        type: "close",
        id: active.id,
        dialog:
          dialog ??
          (active.kind.startsWith("edit")
            ? "edit"
            : (active.kind as "createSimple" | "createSplit")),
      });
  };
  const submitting = (
    dialog: "createSimple" | "createSplit" | "edit",
    value: boolean,
  ) => {
    if (active) dispatch({ type: "submitting", id: active.id, dialog, value });
  };
  const exit = (dialog: "createSimple" | "createSplit" | "edit") => {
    if (active) dispatch({ type: "exit", id: active.id, dialog });
  };

  return {
    flow,
    editingTransactionId: edit?.transaction.id,
    editingTransactionData: edit?.transaction,
    editingSimpleInitialValues:
      edit?.kind === "editSimple" ? edit.initialValues : undefined,
    createSimpleInitialValues:
      createSimple?.initialValues ?? createSplit?.exitingSimple,
    createSplitInitialValues: createSplit?.initialValues,
    close,
    openCreate(simpleEnabled: boolean) {
      const base = { id: ++sequence.current, opened: true, submitting: false };
      show(
        simpleEnabled
          ? { ...base, kind: "createSimple" }
          : { ...base, kind: "createSplit", source: "NEW" },
      );
    },
    async loadTransaction(
      intent: "edit" | "copy",
      load: () => Promise<LoadedTransaction>,
      simpleEnabled: boolean,
    ) {
      if (!latest.hasScope(scopeToken)) return;
      const id = ++sequence.current;
      dispatch({ type: "show", flow: { kind: "loading", id } });
      await latest.load(
        load,
        (transaction) => {
          const simple = deriveSimpleTransactionEditState({
            transaction,
            currentAccountId: accountId,
          });
          const base = { id, opened: true, submitting: false };
          if (intent === "edit") {
            show(
              simple.eligible && simpleEnabled
                ? {
                    ...base,
                    kind: "editSimple",
                    transaction,
                    initialValues: simple.initialValues,
                  }
                : { ...base, kind: "editSplit", transaction },
            );
          } else {
            show(
              simple.eligible && simpleEnabled
                ? {
                    ...base,
                    kind: "createSimple",
                    initialValues: createCopySimpleTransactionInitialValues(
                      simple.initialValues,
                    ),
                  }
                : {
                    ...base,
                    kind: "createSplit",
                    source: "COPY",
                    initialValues:
                      createCopyTransactionInitialValues(transaction),
                  },
            );
          }
        },
        () => dispatch({ type: "show", flow: { kind: "idle" } }),
      );
    },
    switchCreateToSplit(
      draft: SimpleTransactionDraftValues,
      args: Pick<
        Parameters<typeof createSplitInitialValuesFromSimpleDraft>[0],
        "allAccountOptions" | "currentAccount"
      >,
    ) {
      if (!createSimple) return;
      show({
        ...createSimple,
        kind: "createSplit",
        source: createSimple.initialValues ? "COPY" : "DRAFT",
        exitingSimple: createSimple.initialValues,
        initialValues: createSplitInitialValuesFromSimpleDraft({
          ...args,
          draft,
          fallback: {
            date: new Date(),
            description: "",
            counterAccountId: "",
            amount: 0,
            direction: "DEBIT",
          },
        }),
      });
    },
    switchEditToSplit(
      draft: SimpleTransactionDraftValues,
      args: Pick<
        Parameters<typeof createEditTransactionPatchFromSimpleDraft>[0],
        "allAccountOptions" | "currentAccount"
      >,
    ) {
      if (edit?.kind !== "editSimple") return;
      show({
        ...edit,
        kind: "editSplit",
        transaction: {
          ...edit.transaction,
          ...createEditTransactionPatchFromSimpleDraft({
            ...args,
            draft,
            fallback: edit.initialValues,
            transactionId: edit.transaction.id,
          }),
        },
      });
    },
    viewProps: {
      simpleModalOpened: !!createSimple?.opened,
      splitModalOpened: !!createSplit?.opened,
      editModalOpened: !!edit?.opened,
      isSimpleSubmitting: !!createSimple?.submitting,
      isCreateSplitSubmitting: !!createSplit?.submitting,
      isEditSubmitting: !!edit?.submitting,
      editMode:
        edit?.kind === "editSimple" ? ("SIMPLE" as const) : ("SPLIT" as const),
      createSimpleInitialValues:
        createSimple?.initialValues ?? createSplit?.exitingSimple,
      createSplitInitialValues: createSplit?.initialValues,
      createSplitIsCopy: createSplit?.source === "COPY",
      createSplitDateAutoFocus: createSplit?.source === "COPY",
      editingTransactionData: edit?.transaction,
      editingSimpleInitialValues:
        edit?.kind === "editSimple" ? edit.initialValues : undefined,
      onCloseSimpleModal: () => close("createSimple"),
      onCloseSplitModal: () => close("createSplit"),
      onCloseEditModal: () => close("edit"),
      onSimpleModalExitTransitionEnd: () => exit("createSimple"),
      onCreateSplitModalExitTransitionEnd: () => exit("createSplit"),
      onEditModalExitTransitionEnd: () => exit("edit"),
      onSimpleSubmittingChange: (value: boolean) =>
        submitting("createSimple", value),
      onCreateSplitSubmittingChange: (value: boolean) =>
        submitting("createSplit", value),
      onEditSubmittingChange: (value: boolean) => submitting("edit", value),
    },
  };
}
