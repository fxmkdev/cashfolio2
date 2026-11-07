import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Box, Button, Text, VisuallyHidden } from "@mantine/core";
import type { GridApi, GridReadyEvent } from "ag-grid-enterprise";
import { OrganizerGrid } from "./organizer-grid";
import { useOrganizeReveal } from "./use-organize-reveal";
import {
  OrganizerLifecycleDialogs,
  type LifecycleDialog,
} from "./lifecycle-dialogs";
import { OrganizerMutationFeedback } from "./organizer-mutation-feedback";
import { OrganizerToolbar } from "./organizer-toolbar";
import { type OrganizeDisplayRow } from "@/shared/hierarchy-organize/tree";
import type { OrganizeNodeRef } from "@/shared/hierarchy-organize/types";
import { MoveDialog } from "./move-dialog";
import type { Organizer } from "./use-organizer";
import { useOrganizeDrag } from "./use-organize-drag";
import styles from "./organizer.module.css";
import type { HierarchyManagement, HierarchyCreation } from "./management";
import { useManagementFocus } from "./use-management-focus";
import { useOrganizeSelection } from "./use-organize-selection";
import {
  OrganizerBulkLifecycleDialog,
  type BulkLifecycleDialog,
} from "./bulk-lifecycle-dialog";

export function HierarchyOrganizer({
  accountBookId,
  organizer,
  renderLifecycleDialog,
  management,
  creation,
}: {
  accountBookId: string;
  organizer: Organizer;
  management?: HierarchyManagement;
  creation?: HierarchyCreation;
  renderLifecycleDialog?: (
    dialog: LifecycleDialog | undefined,
    onClose: () => void,
  ) => ReactNode;
}) {
  const supportsArchived = organizer.kind !== "assetClasses";
  const label =
    organizer.kind === "assetClasses"
      ? "Asset Classes"
      : organizer.kind === "categories"
        ? "Categories"
        : "Accounts";
  const region = useRef<HTMLElement>(null);
  const [api, setApi] = useState<GridApi<OrganizeDisplayRow>>();
  const [dialogItems, setDialogItems] = useState<OrganizeNodeRef[]>();
  const [lifecycleDialog, setLifecycleDialog] = useState<LifecycleDialog>();
  const [bulkDialog, setBulkDialog] = useState<BulkLifecycleDialog>();
  const movementBlocked =
    organizer.blocked ||
    !!dialogItems ||
    !!lifecycleDialog ||
    !!bulkDialog ||
    !!management?.editorOpened ||
    !!creation?.editorOpened;
  useManagementFocus(region, !!management, movementBlocked);
  const nodes = useMemo(
    () => organizer.snapshot?.nodes ?? [],
    [organizer.snapshot],
  );
  const {
    rows,
    selected,
    roots,
    selectionNotice,
    showArchived,
    onSelectionChanged,
    clearSelection,
    changeArchivedVisibility,
  } = useOrganizeSelection(nodes, api, management?.showArchived);
  const drag = useOrganizeDrag({
    nodes,
    api,
    blocked: movementBlocked,
    saveMove: organizer.saveMove,
    formatErrorMessage: organizer.formatErrorMessage,
  });
  const onInteractionBlockedChange =
    management?.onInteractionBlockedChange ??
    creation?.onInteractionBlockedChange;
  useEffect(() => {
    onInteractionBlockedChange?.(movementBlocked || drag.dragging);
  }, [onInteractionBlockedChange, movementBlocked, drag.dragging]);
  useOrganizeReveal({ api, nodes, rows, organizer, region });
  const onGridReady = useCallback(
    ({ api }: GridReadyEvent<OrganizeDisplayRow>) => setApi(api),
    [],
  );
  const hiddenResults = organizer.revealIds.filter(
    (id) =>
      !showArchived &&
      nodes.some((node) => node.id === id && node.isActive === false),
  ).length;
  return (
    <Box
      ref={region}
      tabIndex={-1}
      component="section"
      aria-label={management ? `${label} Hierarchy` : `Organize ${label}`}
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
        selected={selected}
        roots={roots}
        onMove={() => setDialogItems(roots)}
        onClear={clearSelection}
        onBulkLifecycle={(action) =>
          setBulkDialog({ action, items: [...selected] })
        }
        blocked={movementBlocked}
        dragging={drag.dragging}
        hint={drag.hint}
        organizer={organizer}
        hiddenResults={hiddenResults}
        showArchived={showArchived}
        supportsArchived={supportsArchived && !management}
        onVisibility={changeArchivedVisibility}
      />
      {!dialogItems && !lifecycleDialog && !bulkDialog && (
        <OrganizerMutationFeedback organizer={organizer} />
      )}
      <VisuallyHidden role="status" aria-live="polite">
        {!management && "Organize mode. "}
        {selectionNotice} {organizer.message}{" "}
        {hiddenResults > 0 &&
          `${hiddenResults} affected archived items are hidden. Enable Show Archived to view them.`}
      </VisuallyHidden>
      {!rows.length && (
        <Text size="sm" c="dimmed">
          {showArchived || !supportsArchived || management ? (
            `There are no ${label.toLowerCase()} to organize.`
          ) : (
            <>
              There are no active {label.toLowerCase()} or groups.{" "}
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
        management={management}
        creation={creation}
        drag={drag}
        blocked={management ? movementBlocked : organizer.blocked}
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
        formatErrorMessage={organizer.formatErrorMessage}
      />
      <OrganizerBulkLifecycleDialog
        dialog={bulkDialog}
        organizer={organizer}
        onClose={() => setBulkDialog(undefined)}
      />
      {renderLifecycleDialog ? (
        renderLifecycleDialog(lifecycleDialog, () =>
          setLifecycleDialog(undefined),
        )
      ) : (
        <OrganizerLifecycleDialogs
          dialog={lifecycleDialog}
          organizer={organizer}
          onClose={() => setLifecycleDialog(undefined)}
        />
      )}
    </Box>
  );
}
