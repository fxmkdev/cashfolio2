import { useEffect, useReducer, useRef } from "react";
import type { SimpleTransactionDraftValues } from "@/components/transactions/simple-transaction-modal";
import {
  createLoadedTransactionFlow,
  createSplitTransactionFlow,
  createEditSplitTransactionFlow,
} from "./transaction-flow-builders";
import { getTransactionWorkflowPresentation } from "./transaction-workflow-presentation";
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
  const show = (next: TransactionFlow) => {
    if (!latest.hasScope(scopeToken)) return;
    latest.cancel();
    dispatch({ type: "show", flow: next });
  };

  return {
    flow,
    ...getTransactionWorkflowPresentation(flow, dispatch),
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
        (transaction) =>
          show(
            createLoadedTransactionFlow({
              id,
              accountId,
              intent,
              transaction,
              simpleEnabled,
            }),
          ),
        () => dispatch({ type: "show", flow: { kind: "idle" } }),
      );
    },
    switchCreateToSplit(
      draft: SimpleTransactionDraftValues,
      args: Parameters<typeof createSplitTransactionFlow>[2],
    ) {
      if (flow.kind === "createSimple")
        show(createSplitTransactionFlow(flow, draft, args));
    },
    switchEditToSplit(
      draft: SimpleTransactionDraftValues,
      args: Parameters<typeof createEditSplitTransactionFlow>[2],
    ) {
      if (flow.kind === "editSimple")
        show(createEditSplitTransactionFlow(flow, draft, args));
    },
  };
}
