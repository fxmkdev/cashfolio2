import { useCallback, useRef } from "react";
import type { IRowNode, RowDataUpdatedEvent } from "ag-grid-enterprise";

type NavigateFn = (opts: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

export function useTransactionScroll<Row extends { transactionId: string }>(
  transactionId: string | undefined,
  navigate: NavigateFn,
) {
  const scrollTargetRef = useRef(transactionId);
  scrollTargetRef.current = transactionId;
  const pendingScrollRef = useRef<string | undefined>(undefined);

  const handleRowDataUpdated = useCallback(
    (event: RowDataUpdatedEvent<Row>) => {
      const targetTxId = pendingScrollRef.current ?? scrollTargetRef.current;
      if (!targetTxId) return;

      // Clear search param immediately so subsequent re-renders (e.g. after
      // deleting a transaction) don't pick it up again.
      if (!pendingScrollRef.current && scrollTargetRef.current) {
        navigate({
          search: (prev) => ({ ...prev, transactionId: undefined }),
          replace: true,
        });
      }

      scrollTargetRef.current = undefined;
      pendingScrollRef.current = undefined;

      const rowNodes: IRowNode<Row>[] = [];
      event.api.forEachNode((node) => {
        if (node.data?.transactionId === targetTxId) {
          rowNodes.push(node);
        }
      });
      if (rowNodes.length === 0) return;

      // rowNodes are in display order (newest first); scroll to the last = earliest booking
      event.api.ensureNodeVisible(rowNodes[rowNodes.length - 1]!, "middle");

      // Flash cells after scrolling completes; use bodyScrollEnd event
      // with a rAF fallback for when no scroll is needed (target already visible)
      let flashed = false;
      const flash = () => {
        if (flashed) return;
        flashed = true;
        event.api.removeEventListener("bodyScrollEnd", onScrollEnd);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            event.api.flashCells({ rowNodes });
          });
        });
      };
      const onScrollEnd = () => flash();
      event.api.addEventListener("bodyScrollEnd", onScrollEnd);
      requestAnimationFrame(() => {
        requestAnimationFrame(flash);
      });
    },
    [navigate],
  );

  return { pendingScrollRef, handleRowDataUpdated };
}
