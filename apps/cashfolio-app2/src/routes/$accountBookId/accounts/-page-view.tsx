import { useRef, useState } from "react";
import type { GridApi, GridState } from "ag-grid-enterprise";
import { Alert, Box, Button, Text } from "@mantine/core";
import { AccountOrganizer } from "./-organize/organizer";
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
  const [organizing, setOrganizing] = useState(false);
  const normalGrid = useRef<GridApi<AccountsGridRow> | null>(null);
  const normalGridState = useRef<GridState | undefined>(undefined);
  const openOrganizer = () => {
    normalGridState.current = normalGrid.current?.getState();
    bulkAccountActions?.clearSelection();
    setOrganizing(true);
  };
  const closeOrganizer = () => {
    setOrganizing(false);
    requestAnimationFrame(() => {
      if (normalGridState.current && !normalGrid.current?.isDestroyed()) {
        normalGrid.current?.setState(normalGridState.current, ["rowSelection"]);
      }
    });
  };
  return (
    <PageShell>
      <AccountsPageHeader
        {...props}
        organizing={organizing}
        onOrganize={props.organizerApi ? openOrganizer : undefined}
      />
      {organizing && !isCategories && props.organizerApi && (
        <AccountOrganizer
          accountBookId={props.accountBookId}
          api={props.organizerApi}
          onDone={closeOrganizer}
          onSaved={() => props.onOrganizeSaved?.()}
        />
      )}
      <Box
        style={{
          display: organizing ? "none" : "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
        }}
      >
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
