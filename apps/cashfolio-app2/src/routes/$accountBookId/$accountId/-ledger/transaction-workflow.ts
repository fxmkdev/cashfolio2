import type { SimpleTransactionInitialValues } from "@/components/transactions/simple-transaction-modal";
import type { SimpleTransactionEditInitialValues } from "./page-data";
import type { LedgerTransactionApi } from "./page-mutation-actions";
import type { SplitModalInitialValues } from "./page-view.types";

export type LoadedTransaction = Awaited<
  ReturnType<LedgerTransactionApi["getTransaction"]>
>;
type ActiveBase = { id: number; opened: boolean; submitting: boolean };
export type TransactionFlow =
  | { kind: "idle" }
  | { kind: "loading"; id: number }
  | (ActiveBase & {
      kind: "createSimple";
      initialValues?: SimpleTransactionInitialValues;
    })
  | (ActiveBase & {
      kind: "createSplit";
      initialValues?: SplitModalInitialValues;
      source: "NEW" | "COPY" | "DRAFT";
      exitingSimple?: SimpleTransactionInitialValues;
    })
  | (ActiveBase & {
      kind: "editSimple";
      transaction: LoadedTransaction;
      initialValues: SimpleTransactionEditInitialValues;
    })
  | (ActiveBase & { kind: "editSplit"; transaction: LoadedTransaction });
export type ActiveTransactionFlow = Exclude<
  TransactionFlow,
  { kind: "idle" | "loading" }
>;
type DialogKind = "createSimple" | "createSplit" | "edit";
export type TransactionFlowEvent =
  | { type: "show"; flow: TransactionFlow }
  | { type: "close"; id: number; dialog: DialogKind }
  | { type: "submitting"; id: number; dialog: DialogKind; value: boolean }
  | { type: "exit"; id: number; dialog: DialogKind };

export function transactionWorkflowReducer(
  state: TransactionFlow,
  event: TransactionFlowEvent,
): TransactionFlow {
  if (event.type === "show") return event.flow;
  if (
    state.kind === "idle" ||
    state.id !== event.id ||
    state.kind === "loading"
  )
    return state;
  const matches =
    event.dialog === "edit"
      ? state.kind === "editSimple" || state.kind === "editSplit"
      : event.dialog === state.kind;
  if (event.type === "close")
    return matches ? { ...state, opened: false } : state;
  if (event.type === "submitting")
    return matches ? { ...state, submitting: event.value } : state;
  if (event.dialog === "createSimple" && state.kind === "createSplit")
    return { ...state, exitingSimple: undefined };
  return matches && !state.opened ? { kind: "idle" } : state;
}

/** Request identity survives rerenders; changing scope invalidates every old load. */
export function createLatestTransactionRequest() {
  let scope: string | undefined;
  let current: object | undefined;
  let scopeToken = {};
  return {
    setScope(next: string) {
      if (scope !== next) {
        scope = next;
        current = undefined;
        scopeToken = {};
      }
      return scopeToken;
    },
    hasScope(token: object) {
      return token === scopeToken;
    },
    cancel() {
      current = undefined;
    },
    async load<T>(
      load: () => Promise<T>,
      accept: (value: T) => void,
      reject: () => void,
    ): Promise<void> {
      const token = {};
      current = token;
      let result: T;
      try {
        result = await load();
      } catch (error) {
        if (current === token) {
          reject();
          throw error;
        }
        return;
      }
      if (current === token) accept(result);
    },
  };
}
