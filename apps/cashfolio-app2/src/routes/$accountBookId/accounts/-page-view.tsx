import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { GridApi, GridState } from "ag-grid-enterprise";
import { Alert, Box, Button, Text } from "@mantine/core";
import { AccountOrganizer } from "./-organize/organizer";
import { OrganizerActions } from "./-organize/organizer-actions";
import { useOrganizer } from "./-organize/use-organizer";
import { useOrganizeNavigation } from "./-organize/use-organize-navigation";
import { useGlobalLoading } from "@/components/navigation/global-loading";
import type { AccountsGridRow } from "./-page-types";
import { PageShell } from "@/components/layout/page-shell";
import { UnarchiveMutationFeedback } from "@/components/dialogs/unarchive-mutation-feedback";
import { BulkAccountToolbar } from "./-bulk-account-toolbar";
import { AccountsPageHeader } from "./-page-header";
import { AccountsPageGrid } from "./-page-grid";
import {
  AccountsPageDialogs,
  AccountsBulkAssignmentDialogs,
} from "./-page-dialogs";
import type { AccountsPageViewProps } from "./-page-view-types";
export type { AccountsPageViewProps } from "./-page-view-types";

export function AccountsPageView(props: AccountsPageViewProps) {
  return (
    <AccountsPageContent
      key={`${props.accountBookId}:${props.managementContext ?? "accounts"}:${props.tab}`}
      {...props}
    />
  );
}

function AccountsPageContent(props: AccountsPageViewProps) {
  const {
    bulkAccountActions,
    gainLoss,
    managementContext = "accounts",
  } = props;
  const isCategories = managementContext === "categories";
  const grouping = props.grouping ?? "accountStructure";
  const canOrganize =
    !isCategories && grouping === "accountStructure" && !!props.organizerApi;
  const [organizing, setOrganizing] = useState(false);
  const requested = !!props.organize && canOrganize;
  const isOrganizing = organizing && requested;
  const organizer = useOrganizer(
    props.onOrganizeSaved ?? (() => {}),
    props.organizerApi,
    false,
  );
  useGlobalLoading(organizer.loading || organizer.submitState.isRefreshing);
  const navigation = useOrganizeNavigation(
    props.accountBookId,
    !!props.organize,
    canOrganize,
    organizer.pending,
  );
  const { reset, load, snapshot } = organizer;
  const normalGrid = useRef<GridApi<AccountsGridRow> | null>(null);
  const normalGridState = useRef<GridState | undefined>(undefined);
  const activate = useEffectEvent(() => {
    normalGridState.current = normalGrid.current?.getState();
    bulkAccountActions?.clearSelection();
    setOrganizing(true);
  });
  useEffect(() => {
    if (requested && snapshot && !organizing) activate();
  }, [organizing, requested, snapshot]);
  useEffect(() => {
    if (requested) {
      void load();
      return reset;
    }
    setOrganizing(false);
    reset();
    const frame = requestAnimationFrame(() => {
      if (normalGridState.current && !normalGrid.current?.isDestroyed()) {
        normalGrid.current?.setState(normalGridState.current, ["rowSelection"]);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [load, requested, reset]);
  return (
    <PageShell>
      <AccountsPageHeader
        {...props}
        organizing={isOrganizing}
        onOrganize={canOrganize ? navigation.enter : undefined}
        organizePending={organizer.loading}
        organizerActions={
          <OrganizerActions organizer={organizer} onDone={navigation.exit} />
        }
      />
      {isOrganizing && (
        <AccountOrganizer
          accountBookId={props.accountBookId}
          organizer={organizer}
        />
      )}
      <Box
        style={{
          display: isOrganizing ? "none" : "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
        }}
      >
        {canOrganize && organizer.loadError && (
          <Alert color="red" role="alert">
            {organizer.loadError}
            <Button variant="subtle" onClick={() => void load()}>
              Try Again
            </Button>
          </Alert>
        )}
        <UnarchiveMutationFeedback
          listLabel={isCategories ? "category list" : "account list"}
          recovery={props.unarchiveRecovery}
          onRefreshConstraints={props.onRefreshConstraints}
        />
        {!isCategories && (
          <Text size="sm" c="dimmed" mb="sm">
            Totals include active and archived accounts, including collapsed
            groups.
          </Text>
        )}
        {gainLoss?.error ? (
          <Alert color="red" title="Gain/Loss Unavailable" mb="sm">
            {gainLoss.error}
            <Button variant="subtle" size="xs" onClick={gainLoss.retry}>
              Retry
            </Button>
          </Alert>
        ) : null}
        {bulkAccountActions && (
          <BulkAccountToolbar actions={bulkAccountActions} />
        )}
        <AccountsBulkAssignmentDialogs {...props} />
        <AccountsPageGrid
          {...props}
          onGridReady={(event) => {
            normalGrid.current = event.api;
            props.onGridReady?.(event);
          }}
        />
      </Box>
      <AccountsPageDialogs {...props} />
    </PageShell>
  );
}
