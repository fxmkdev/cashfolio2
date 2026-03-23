import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import type { ColDef, RowDragEndEvent } from "ag-grid-enterprise";
import { DataGrid } from "./data-grid";

export type ReorderGroupChildRow = {
  id: string;
  name: string;
  nodeType: "account" | "accountGroup";
};

export function ReorderGroupChildrenModal({
  opened,
  onClose,
  rowName,
  initialRows,
  onReorder,
}: {
  opened: boolean;
  onClose: () => void;
  rowName: string;
  initialRows: ReorderGroupChildRow[];
  onReorder: (rows: ReorderGroupChildRow[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<ReorderGroupChildRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const handleClose = () => {
    if (isSaving) return;
    onClose();
  };

  useEffect(() => {
    if (!opened) return;
    setRows(initialRows);
  }, [opened, initialRows]);

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

  const handleRowDragEnd = useCallback(
    async (event: RowDragEndEvent<ReorderGroupChildRow>) => {
      if (isSaving) return;

      const reorderedRows: ReorderGroupChildRow[] = [];
      event.api.forEachNodeAfterFilterAndSort((node) => {
        if (node.data) reorderedRows.push(node.data);
      });
      if (reorderedRows.length !== rows.length) return;
      const changed = reorderedRows.some((row, i) => row.id !== rows[i]?.id);
      if (!changed) return;

      setRows(reorderedRows);
      setIsSaving(true);
      try {
        await onReorder(reorderedRows);
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, onReorder, rows],
  );

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
            rowData={rows}
            columnDefs={columnDefs}
            getRowId={({ data }) => data.id}
            headerHeight={0}
            rowDragManaged
            animateRows
            onRowDragEnd={handleRowDragEnd}
            suppressMovableColumns
            suppressCellFocus
          />
        </div>
        <Group justify="flex-end">
          <Button onClick={handleClose} loading={isSaving} disabled={isSaving}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
