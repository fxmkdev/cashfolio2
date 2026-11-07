import { useCallback, useMemo, useState } from "react";
import { useGainLossRequest } from "@/hooks/use-gain-loss-request";
import { getAccountReturnDetails } from "@/server/account-returns";
import { AccountReturnSummaryView } from "./return-summary";
import { AccountReturnDrawer } from "./return-drawer";

export function AccountReturnSection(args: {
  accountBookId: string;
  accountId: string;
  period?: string;
  refreshKey: unknown;
  onOpenTransaction: (id: string) => void;
}) {
  const [opened, setOpened] = useState(false);
  const { accountBookId, accountId, period } = args;
  const target = useMemo(
    () => ({ kind: "account" as const, id: accountId }),
    [accountId],
  );
  const load = useCallback(
    () =>
      getAccountReturnDetails({
        data: {
          accountBookId,
          target,
          period,
          grouping: "accountStructure",
          accountState: "all",
        },
      }),
    [accountBookId, target, period],
  );
  const request = useGainLossRequest({
    enabled: true,
    scopeKey: `${accountBookId}:${accountId}:${period ?? "today"}`,
    refreshKey: args.refreshKey,
    load,
    errorMessage: "Returns could not be loaded. Please try again.",
  });
  return (
    <>
      <AccountReturnSummaryView
        {...request}
        onRetry={request.retry}
        onViewCalculation={() => setOpened(true)}
      />
      <AccountReturnDrawer
        accountBookId={accountBookId}
        accountState="all"
        grouping="accountStructure"
        target={opened ? target : undefined}
        period={period}
        refreshKey={args.refreshKey}
        onClose={() => setOpened(false)}
        onOpenTransaction={args.onOpenTransaction}
      />
    </>
  );
}
