import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Text, VisuallyHidden } from "@mantine/core";
import type {
  GridApi,
  GridReadyEvent,
  SelectionChangedEvent,
} from "ag-grid-enterprise";
import { OrganizerGrid } from "./organizer-grid";
import { useOrganizeReveal } from "./use-organize-reveal";
import {
  OrganizerLifecycleDialogs,
  type LifecycleDialog,
} from "./lifecycle-dialogs";
import { OrganizerMutationFeedback } from "./organizer-mutation-feedback";
import { OrganizerToolbar } from "./organizer-toolbar";
import {
  normalizeOrganizeSelection,
  organizeDisplayRows,
  type OrganizeDisplayRow,
} from "@/shared/account-organize/tree";
import type { OrganizeNodeRef } from "@/shared/account-organize/types";
import { MoveDialog } from "./move-dialog";
import type { Organizer } from "./use-organizer";
import { useOrganizeDrag } from "./use-organize-drag";
import styles from "./organizer.module.css";

export function AccountOrganizer({
  accountBookId,
  organizer,
}: {
  accountBookId: string;
  organizer: Organizer;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState("");
  const region = useRef<HTMLElement>(null);
  const [api, setApi] = useState<GridApi<OrganizeDisplayRow>>();
  const [selected, setSelected] = useState<OrganizeNodeRef[]>([]);
  const [dialogItems, setDialogItems] = useState<OrganizeNodeRef[]>();
  const [lifecycleDialog, setLifecycleDialog] = useState<LifecycleDialog>();
  const movementBlocked =
    organizer.blocked || !!dialogItems || !!lifecycleDialog;
  const nodes = useMemo(
    () => organizer.snapshot?.nodes ?? [],
    [organizer.snapshot],
  );
  const rows = useMemo(
    () => organizeDisplayRows(nodes, showArchived),
    [nodes, showArchived],
  );
  useEffect(() => {
    const visible = new Set(rows.map((row) => row.id));
    const retained = selected.filter((item) => visible.has(item.id));
    if (retained.length !== selected.length) {
      setSelected(retained);
      setSelectionNotice(
        `${selected.length - retained.length} unavailable or hidden ${selected.length - retained.length === 1 ? "item was" : "items were"} deselected.`,
      );
    }
  }, [rows, selected]);
  const roots = useMemo(
    () =>
      normalizeOrganizeSelection(
        nodes,
        selected.filter((item) => nodes.some((node) => node.id === item.id)),
      ),
    [nodes, selected],
  );
  const drag = useOrganizeDrag({
    nodes,
    api,
    blocked: movementBlocked,
    saveMove: organizer.saveMove,
  });
  useOrganizeReveal({ api, nodes, rows, organizer, region });
  const onGridReady = useCallback(
    ({ api }: GridReadyEvent<OrganizeDisplayRow>) => setApi(api),
    [],
  );
  const onSelectionChanged = useCallback(
    ({ api }: SelectionChangedEvent<OrganizeDisplayRow>) =>
      setSelected(api.getSelectedRows()),
    [],
  );
  const changeArchivedVisibility = (value: boolean) => {
    if (!value) {
      const hidden = selected.filter(
        (item) => !nodes.find((node) => node.id === item.id)?.isActive,
      );
      for (const item of hidden) api?.getRowNode(item.id)?.setSelected(false);
      setSelected(
        selected.filter((item) => !hidden.some((node) => node.id === item.id)),
      );
      setSelectionNotice(
        hidden.length
          ? `${hidden.length} hidden archived ${hidden.length === 1 ? "item was" : "items were"} deselected.`
          : "",
      );
    } else setSelectionNotice("");
    setShowArchived(value);
  };
  const hiddenResults = organizer.revealIds.filter(
    (id) =>
      !showArchived && nodes.some((node) => node.id === id && !node.isActive),
  ).length;
  return (
    <Box
      ref={region}
      tabIndex={-1}
      component="section"
      aria-label="Organize Accounts"
      className={movementBlocked ? styles.blocked : undefined}
      data-account-book-id={accountBookId}
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      <OrganizerToolbar
        selectedCount={selected.length}
        roots={roots}
        onMove={() => setDialogItems(roots)}
        onClear={() => {
          api?.deselectAll();
          setSelected([]);
        }}
        blocked={movementBlocked}
        dragging={drag.dragging}
        hint={drag.hint}
        organizer={organizer}
        hiddenResults={hiddenResults}
        showArchived={showArchived}
        onVisibility={changeArchivedVisibility}
      />
      {!dialogItems && !lifecycleDialog && (
        <OrganizerMutationFeedback organizer={organizer} />
      )}
      <VisuallyHidden role="status" aria-live="polite">
        Organize mode. {selectionNotice} {organizer.message}{" "}
        {hiddenResults > 0 &&
          `${hiddenResults} affected archived items are hidden. Enable Show Archived to view them.`}
      </VisuallyHidden>
      {!rows.length && (
        <Text size="sm" c="dimmed">
          {showArchived ? (
            "There are no accounts or groups to organize."
          ) : (
            <>
              There are no active accounts or groups.{" "}
              <Button
                variant="subtle"
                size="compact-sm"
                onClick={() => changeArchivedVisibility(true)}
              >
                Show Archived
              </Button>
            </>
          )}
        </Text>
      )}
      <OrganizerGrid
        rows={rows}
        api={api}
        organizer={organizer}
        drag={drag}
        blocked={organizer.blocked}
        onGridReady={onGridReady}
        onSelectionChanged={onSelectionChanged}
        onMoveItems={setDialogItems}
        onLifecycle={setLifecycleDialog}
      />
      <MoveDialog
        nodes={nodes}
        showArchived={showArchived}
        items={dialogItems}
        pending={organizer.pending}
        blocked={organizer.blocked}
        submission={{
          state: organizer.submitState,
          onRefreshConstraints: organizer.refresh,
          retryDisabled: organizer.retryDisabled,
        }}
        onClose={() => setDialogItems(undefined)}
        onMove={organizer.saveMove}
      />
      <OrganizerLifecycleDialogs
        dialog={lifecycleDialog}
        organizer={organizer}
        onClose={() => setLifecycleDialog(undefined)}
      />
    </Box>
  );
}
