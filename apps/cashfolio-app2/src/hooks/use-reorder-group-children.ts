import { useEffect, useRef, useState } from "react";
import { useDialogSubmitState } from "./use-dialog-submit-state";

export type ReorderGroupChildRow = {
  id: string;
  name: string;
  nodeType: "account" | "accountGroup";
};

function sameMembers(a: ReorderGroupChildRow[], b: ReorderGroupChildRow[]) {
  const keys = new Set(a.map((row) => `${row.nodeType}:${row.id}`));
  return (
    a.length === b.length &&
    b.every((row) => keys.has(`${row.nodeType}:${row.id}`))
  );
}

export function useReorderGroupChildren({
  opened,
  initialRows,
  onReorder,
  onRefreshConstraints,
}: {
  opened: boolean;
  initialRows: ReorderGroupChildRow[];
  onReorder: (rows: ReorderGroupChildRow[]) => Promise<void>;
  onRefreshConstraints?: () => Promise<void>;
}) {
  const [rows, setRows] = useState(initialRows);
  const confirmedRows = useRef(initialRows);
  const [attemptedRows, setAttemptedRows] = useState<
    ReorderGroupChildRow[] | null
  >(null);
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

  const save = async (nextRows: ReorderGroupChildRow[]) => {
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
  const reorder = async (nextRows: ReorderGroupChildRow[]) => {
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
