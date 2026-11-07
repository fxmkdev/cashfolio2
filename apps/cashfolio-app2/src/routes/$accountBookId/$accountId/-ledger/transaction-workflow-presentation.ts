import type {
  TransactionFlow,
  TransactionFlowEvent,
} from "./transaction-workflow";

type DialogKind = Extract<TransactionFlowEvent, { type: "close" }>["dialog"];

/** Adapt reducer state to the existing dialog contracts without owning its lifecycle. */
export function getTransactionWorkflowPresentation(
  flow: TransactionFlow,
  dispatch: (event: TransactionFlowEvent) => void,
) {
  const active =
    flow.kind !== "idle" && flow.kind !== "loading" ? flow : undefined;
  const createSimple = flow.kind === "createSimple" ? flow : undefined;
  const createSplit = flow.kind === "createSplit" ? flow : undefined;
  const edit =
    flow.kind === "editSimple" || flow.kind === "editSplit" ? flow : undefined;
  const data = {
    editingTransactionData: edit?.transaction,
    editingSimpleInitialValues:
      edit?.kind === "editSimple" ? edit.initialValues : undefined,
    createSimpleInitialValues:
      createSimple?.initialValues ?? createSplit?.exitingSimple,
    createSplitInitialValues: createSplit?.initialValues,
  };
  const close = (dialog?: DialogKind) => {
    if (!active) return;
    const currentDialog =
      active.kind === "createSimple" || active.kind === "createSplit"
        ? active.kind
        : "edit";
    dispatch({ type: "close", id: active.id, dialog: dialog ?? currentDialog });
  };
  const submitting = (dialog: DialogKind, value: boolean) => {
    if (active) dispatch({ type: "submitting", id: active.id, dialog, value });
  };
  const exit = (dialog: DialogKind) => {
    if (active) dispatch({ type: "exit", id: active.id, dialog });
  };
  return {
    ...data,
    editingTransactionId: edit?.transaction.id,
    close,
    viewProps: {
      ...data,
      simpleModalOpened: !!createSimple?.opened,
      splitModalOpened: !!createSplit?.opened,
      editModalOpened: !!edit?.opened,
      isSimpleSubmitting: !!createSimple?.submitting,
      isCreateSplitSubmitting: !!createSplit?.submitting,
      isEditSubmitting: !!edit?.submitting,
      editMode:
        edit?.kind === "editSimple" ? ("SIMPLE" as const) : ("SPLIT" as const),
      createSplitIsCopy: createSplit?.source === "COPY",
      createSplitDateAutoFocus: createSplit?.source === "COPY",
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
