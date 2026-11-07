import { Alert, Box, Button, Text } from "@mantine/core";
import { HierarchyOrganizer } from "@/components/hierarchy-organize/organizer";
import { UnarchiveMutationFeedback } from "@/components/dialogs/unarchive-mutation-feedback";
import { BulkAccountToolbar } from "./-bulk-account-toolbar";
import { AccountsPageGrid } from "./-page-grid";
import {
  AccountsPageDialogs,
  AccountsBulkAssignmentDialogs,
} from "./-page-dialogs";
import type { AccountsPageViewProps } from "./-page-view-types";
import type { useAccountsPageInteractions } from "./-use-page-interactions";

export function AccountsPageBody({
  props,
  interactions,
}: {
  props: AccountsPageViewProps;
  interactions: ReturnType<typeof useAccountsPageInteractions>;
}) {
  const {
    bulkAccountActions,
    gainLoss,
    managementContext = "accounts",
  } = props;
  const isCategories = managementContext === "categories";
  const { organizer, canOrganize, isOrganizing } = interactions;
  const { load } = organizer;
  return (
    <>
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
        <AccountsPageGrid {...props} onGridReady={interactions.onGridReady} />
      </Box>
      <AccountsPageDialogs {...props} />
    </>
  );
}
