import { Alert, Button, Drawer, Loader } from "@mantine/core";
import { useCallback, useState } from "react";
import { getAccountGainLoss } from "@/server/account-gain-loss";
import { useGainLossRequest } from "@/hooks/use-gain-loss-request";
import { AccountGainLossSummaryView } from "./account-gain-loss-summary";
import { AccountGainLossCalculation } from "./account-gain-loss-calculation";
export function AccountGainLossSection(args: {
  accountBookId: string;
  accountId: string;
  period?: string;
  refreshKey: unknown;
  onOpenTransaction: (transactionId: string) => void;
}) {
  const [opened, setOpened] = useState(false);
  const scopeKey = `${args.accountBookId}:${args.accountId}:${args.period ?? "today"}`;
  const loadSummary = useCallback(
    () =>
      getAccountGainLoss({
        data: {
          accountBookId: args.accountBookId,
          accountId: args.accountId,
          period: args.period,
        },
      }),
    [args.accountBookId, args.accountId, args.period],
  );
  const loadDetails = useCallback(
    () =>
      getAccountGainLoss({
        data: {
          accountBookId: args.accountBookId,
          accountId: args.accountId,
          period: args.period,
          includeDetails: true,
        },
      }),
    [args.accountBookId, args.accountId, args.period],
  );
  const summary = useGainLossRequest({
    enabled: true,
    scopeKey,
    refreshKey: args.refreshKey,
    load: loadSummary,
  });
  const details = useGainLossRequest({
    enabled: opened,
    scopeKey,
    refreshKey: args.refreshKey,
    load: loadDetails,
  });
  // Details include their own summary so changing provider availability never creates a misleading mismatch.
  return (
    <>
      <AccountGainLossSummaryView
        {...summary}
        data={details.data ?? summary.data}
        onRetry={summary.retry}
        onViewCalculation={() => setOpened(true)}
      />
      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        position="right"
        size="90%"
        title="Gain/Loss Calculation"
      >
        {details.loading ? <Loader aria-label="Loading Calculation" /> : null}
        {details.error ? (
          <Alert color="red" title="Calculation Unavailable">
            {details.error}
            <Button onClick={details.retry}>Retry</Button>
          </Alert>
        ) : null}
        {details.data ? (
          <AccountGainLossCalculation
            data={details.data}
            onOpenTransaction={args.onOpenTransaction}
          />
        ) : null}
      </Drawer>
    </>
  );
}
