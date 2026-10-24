import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import {
  createLedgerReturnTarget,
  type LedgerReturnTarget,
} from "@/shared/ledger-navigation";

declare module "@tanstack/react-router" {
  interface HistoryState {
    ledgerReturnTarget?: LedgerReturnTarget;
  }
}

/** Capture the immediate source, never another ledger's return target. */
export function useLedgerNavigationState() {
  const router = useRouter();
  // Capture at navigation time without rebuilding grid columns on URL changes.
  return useCallback(() => {
    const state = router.state;
    const accountBookId = state.location.pathname.split("/")[1];
    const ledgerMatch = state.matches.find(
      (match) => match.routeId === "/$accountBookId/$accountId",
    );
    const loaderData = ledgerMatch?.loaderData as
      { account?: { name?: string } } | undefined;
    const target = createLedgerReturnTarget({
      accountBookId,
      href: state.location.href,
      ledgerName: loaderData?.account?.name,
      historyIndex: state.location.state.__TSR_index,
    });
    return { ledgerReturnTarget: target ?? undefined };
  }, [router]);
}
