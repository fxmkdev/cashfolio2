import { Alert, Box, Button, Text } from "@mantine/core";
import { HierarchyOrganizer } from "@/components/hierarchy-organize/organizer";
import { OrganizerActions } from "@/components/hierarchy-organize/organizer-actions";
import { useOrganizeSession } from "@/components/hierarchy-organize/use-organize-session";
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
  const canOrganize = grouping === "accountStructure" && !!props.organizerApi;
  const { organizer, navigation, normalGrid, isOrganizing } =
    useOrganizeSession<AccountsGridRow>({
      accountBookId: props.accountBookId,
      requested: !!props.organize,
      available: canOrganize,
      page: isCategories ? "categories" : "accounts",
      api: props.organizerApi,
      onSaved: props.onOrganizeSaved ?? (() => {}),
      onActivate: () => bulkAccountActions?.clearSelection(),
    });
  const { load } = organizer;
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
        <HierarchyOrganizer
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
