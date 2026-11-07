import type { SimpleTransactionDraftValues } from "@/components/transactions/simple-transaction-modal";
import { createCopyTransactionInitialValues } from "@/components/transaction-editor/edit-transaction-modal-values";
import { deriveSimpleTransactionEditState } from "./page-data";
import {
  createEditTransactionPatchFromSimpleDraft,
  createSplitInitialValuesFromSimpleDraft,
} from "./page-edit-flow";
import { createCopySimpleTransactionInitialValues } from "./page-transaction-utils";
import type {
  ActiveTransactionFlow,
  LoadedTransaction,
} from "./transaction-workflow";

export function createLoadedTransactionFlow(args: {
  id: number;
  accountId: string;
  intent: "edit" | "copy";
  transaction: LoadedTransaction;
  simpleEnabled: boolean;
}): ActiveTransactionFlow {
  const { transaction } = args;
  const simple = deriveSimpleTransactionEditState({
    transaction,
    currentAccountId: args.accountId,
  });
  const base = { id: args.id, opened: true, submitting: false };
  if (args.intent === "edit") {
    return simple.eligible && args.simpleEnabled
      ? {
          ...base,
          kind: "editSimple",
          transaction,
          initialValues: simple.initialValues,
        }
      : { ...base, kind: "editSplit", transaction };
  }
  return simple.eligible && args.simpleEnabled
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
        initialValues: createCopyTransactionInitialValues(transaction),
      };
}

export function createSplitTransactionFlow(
  state: Extract<ActiveTransactionFlow, { kind: "createSimple" }>,
  draft: SimpleTransactionDraftValues,
  args: Pick<
    Parameters<typeof createSplitInitialValuesFromSimpleDraft>[0],
    "allAccountOptions" | "currentAccount"
  >,
): Extract<ActiveTransactionFlow, { kind: "createSplit" }> {
  return {
    ...state,
    kind: "createSplit",
    source: state.initialValues ? "COPY" : "DRAFT",
    exitingSimple: state.initialValues,
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
  };
}

export function createEditSplitTransactionFlow(
  state: Extract<ActiveTransactionFlow, { kind: "editSimple" }>,
  draft: SimpleTransactionDraftValues,
  args: Pick<
    Parameters<typeof createEditTransactionPatchFromSimpleDraft>[0],
    "allAccountOptions" | "currentAccount"
  >,
): Extract<ActiveTransactionFlow, { kind: "editSplit" }> {
  return {
    ...state,
    kind: "editSplit",
    transaction: {
      ...state.transaction,
      ...createEditTransactionPatchFromSimpleDraft({
        ...args,
        draft,
        fallback: state.initialValues,
        transactionId: state.transaction.id,
      }),
    },
  };
}
