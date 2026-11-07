import { fetchWithResourceErrors } from "@/shared/resource-fetch";
import { loadCompleteReturnWork } from "@/shared/load-return-work";
import { Alert, Button, Drawer, Loader } from "@mantine/core";
import { useCallback } from "react";
import { getAccountReturnDetails } from "@/server/account-returns";
import { useGainLossRequest } from "@/hooks/use-gain-loss-request";
import type {
  AccountReturnScope,
  AccountReturnTarget,
} from "@/shared/account-returns";
import { ReturnCalculation } from "./return-calculation";

export function AccountReturnDrawer(
  args: AccountReturnScope & {
    target?: AccountReturnTarget;
    period?: string;
    refreshKey: unknown;
    onClose: () => void;
    onOpenTransaction?: (id: string, date: string) => void;
  },
) {
  const { accountBookId, grouping, accountState, target, period } = args;
  const load = useCallback(
    (signal: AbortSignal) => {
      if (!target) throw new Error("Choose an account or group.");
      return loadCompleteReturnWork(
        (continuation, batchSize) =>
          getAccountReturnDetails({
            signal,
            fetch: fetchWithResourceErrors,
            data: {
              accountBookId,
              continuation,
              batchSize,
              grouping,
              accountState,
              target,
              period,
              includeDetails: true,
            },
          }),
        signal,
      );
    },
    [accountBookId, grouping, accountState, target, period],
  );
  const request = useGainLossRequest({
    enabled: !!target,
    scopeKey: `${accountBookId}:${grouping}:${accountState}:${JSON.stringify(target)}:${period ?? "today"}`,
    refreshKey: args.refreshKey,
    load,
    errorMessage: "Returns could not be loaded. Please try again.",
  });
  return (
    <Drawer
      opened={!!target}
      onClose={args.onClose}
      position="right"
      size="90%"
      title="Return Calculation"
    >
      {request.loading ? (
        <Loader aria-label="Loading return calculation" />
      ) : null}
      {request.error ? (
        <Alert color="red" title="Returns Unavailable">
          {request.error}
          <Button onClick={request.retry}>Retry</Button>
        </Alert>
      ) : null}
      {request.data ? (
        <ReturnCalculation
          data={request.data}
          onOpenTransaction={
            args.onOpenTransaction
              ? (id, date) => {
                  args.onClose();
                  args.onOpenTransaction!(id, date);
                }
              : undefined
          }
        />
      ) : null}
    </Drawer>
  );
}
