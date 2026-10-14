import { useMemo } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import type { ColDef, RowDragEndEvent } from "ag-grid-enterprise";
import { DataGrid } from "../grid/data-grid";
import { MutationSubmitFeedback } from "../dialogs/mutation-submit-feedback";
import {
  useReorderGroupChildren,
  type ReorderGroupChildRow,
} from "../../hooks/use-reorder-group-children";
export type { ReorderGroupChildRow } from "../../hooks/use-reorder-group-children";

export function ReorderGroupChildrenModal({
  opened,
  onClose,
  rowName,
  initialRows,
  onReorder,
  onRefreshConstraints,
}: {
  opened: boolean;
  onClose: () => void;
  rowName: string;
  initialRows: ReorderGroupChildRow[];
  onReorder: (rows: ReorderGroupChildRow[]) => Promise<void>;
  onRefreshConstraints?: () => Promise<void>;
}) {
  const { rows, gridVersion, reorder, retry, membershipChanged, submitState } =
    useReorderGroupChildren({
      opened,
      initialRows,
      onReorder,
      onRefreshConstraints,
    });
  const isSaving = submitState.isSubmitting || submitState.isRefreshing;
  const handleClose = () => {
    if (isSaving) return;
    submitState.clearSubmissionError();
    onClose();
  };

  const columnDefs = useMemo<ColDef<ReorderGroupChildRow>[]>(
    () => [
      {
        headerName: "Name",
        field: "name",
        flex: 1,
        rowDrag: true,
        sortable: false,
        filter: false,
        resizable: false,
        suppressHeaderMenuButton: true,
      },
    ],
    [],
  );

  const handleRowDragEnd = async (
    event: RowDragEndEvent<ReorderGroupChildRow>,
  ) => {
    const reorderedRows: ReorderGroupChildRow[] = [];
    event.api.forEachNodeAfterFilterAndSort((node) => {
      if (node.data) reorderedRows.push(node.data);
    });
    await reorder(reorderedRows);
  };

  const gridHeight = Math.min(Math.max(rows.length * 38 + 2, 120), 360);

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Reorder Siblings"
      size="md"
      closeOnEscape={!isSaving}
      closeOnClickOutside={!isSaving}
      withCloseButton={!isSaving}
    >
      <Stack gap="md">
        <Text c="dimmed" size="sm">
          {`Siblings of ${rowName}`}
        </Text>
        <div style={{ height: `${gridHeight}px` }}>
          <DataGrid
            key={gridVersion}
            rowData={rows}
            columnDefs={columnDefs}
            getRowId={({ data }) => data.id}
            headerHeight={0}
            rowDragManaged
            suppressRowDrag={isSaving}
            animateRows
            onRowDragEnd={handleRowDragEnd}
            suppressMovableColumns
            suppressCellFocus
          />
        </div>
        <MutationSubmitFeedback
          state={submitState}
          onRefreshConstraints={onRefreshConstraints}
          onRetry={retry}
          retryDisabled={membershipChanged}
        />
        {submitState.submissionError &&
          !submitState.submissionError.isUncertainOutcome && (
            <Text size="sm">
              The reorder was not saved. Showing the confirmed order.
            </Text>
          )}
        {membershipChanged && submitState.submissionError && (
          <Text size="sm">
            The siblings changed. Drag the updated rows to reorder them.
          </Text>
        )}
        <Group justify="flex-end">
          <Button onClick={handleClose} loading={isSaving} disabled={isSaving}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
