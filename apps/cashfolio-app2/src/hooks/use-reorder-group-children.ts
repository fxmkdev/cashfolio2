import { useEffect, useRef, useState } from "react";
import { useDialogSubmitState } from "./use-dialog-submit-state";

export type ReorderSiblingRow = { id: string; name: string; nodeType: string };

export type ReorderGroupChildRow = {
  id: string;
  name: string;
  nodeType: "account" | "accountGroup";
};

function sameMembers(a: ReorderSiblingRow[], b: ReorderSiblingRow[]) {
  const keys = new Set(a.map((row) => `${row.nodeType}:${row.id}`));
  return (
    a.length === b.length &&
    b.every((row) => keys.has(`${row.nodeType}:${row.id}`))
  );
}

export function useReorderGroupChildren<T extends ReorderSiblingRow>({
  opened,
  initialRows,
  onReorder,
  onRefreshConstraints,
}: {
  opened: boolean;
  initialRows: T[];
  onReorder: (rows: T[]) => Promise<void>;
  onRefreshConstraints?: () => Promise<void>;
}) {
  const [rows, setRows] = useState(initialRows);
  const confirmedRows = useRef(initialRows);
  const [attemptedRows, setAttemptedRows] = useState<T[] | null>(null);
  // Managed dragging changes AG Grid's internal order even when rowData is the
  // same reference. Remount on rejection to restore the confirmed order.
  const [gridVersion, setGridVersion] = useState(0);
  const submitState = useDialogSubmitState({
    captureErrors: true,
    onRefreshConstraints,
  });

  useEffect(() => {
    if (!opened) return;
    confirmedRows.current = initialRows;
    setRows(initialRows);
  }, [opened, initialRows]);

  const save = async (nextRows: T[]) => {
    return submitState.runSubmit(async () => {
      setAttemptedRows(nextRows);
      setRows(nextRows);
      try {
        await onReorder(nextRows);
        confirmedRows.current = nextRows;
      } catch (error) {
        setRows(confirmedRows.current);
        setGridVersion((version) => version + 1);
        throw error;
      }
    });
  };
  const reorder = async (nextRows: T[]) => {
    if (!sameMembers(rows, nextRows)) return;
    if (nextRows.every((row, index) => row.id === rows[index]?.id)) return;
    await save(nextRows);
  };
  const membershipChanged =
    !!attemptedRows && !sameMembers(initialRows, attemptedRows);
  const retry = () => {
    if (
      !attemptedRows ||
      membershipChanged ||
      !submitState.submissionError?.isBusy
    )
      return;
    return save(attemptedRows);
  };
  return { rows, gridVersion, reorder, retry, membershipChanged, submitState };
}
