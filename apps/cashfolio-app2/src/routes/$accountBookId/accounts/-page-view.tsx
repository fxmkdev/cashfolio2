import { Alert, Button, Text } from "@mantine/core";
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
  const {
    bulkAccountActions,
    gainLoss,
    managementContext = "accounts",
  } = props;
  const isCategories = managementContext === "categories";
  return (
    <PageShell>
      <AccountsPageHeader {...props} />
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
      <AccountsPageGrid {...props} />
      <AccountsPageDialogs {...props} />
    </PageShell>
  );
}
