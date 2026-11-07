import { Alert, Box, Button, Text } from "@mantine/core";
import { HierarchyOrganizer } from "@/components/hierarchy-organize/organizer";
import { OrganizerActions } from "@/components/hierarchy-organize/organizer-actions";
import { useOrganizeSession } from "@/components/hierarchy-organize/use-organize-session";
import type { AccountsGridRow } from "./page-types";
import { PageShell } from "@/components/layout/page-shell";
import { UnarchiveMutationFeedback } from "@/components/dialogs/unarchive-mutation-feedback";
import { BulkAccountToolbar } from "./bulk-account-toolbar";
import { AccountsPageHeader } from "./page-header";
import { AccountsPageGrid } from "./page-grid";
import {
  AccountsPageDialogs,
  AccountsBulkAssignmentDialogs,
} from "./page-dialogs";
import type { AccountsPageViewProps } from "./page-view-types";
import { CategoriesPageView } from "./categories-page";
import { useState } from "react";
import { AccountOrganizeDialogs } from "./organize-dialogs";
import { AccountRowMoveDialog } from "./row-move-dialog";
export type { AccountsPageViewProps } from "./page-view-types";

export function AccountsPageView(props: AccountsPageViewProps) {
  if (props.managementContext === "categories")
    return (
      <CategoriesPageView
        key={`${props.accountBookId}:${props.tab}`}
        {...props}
      />
    );
  return (
    <AccountsPageContent
      key={`${props.accountBookId}:${props.managementContext ?? "accounts"}:${props.tab}`}
      {...props}
    />
  );
}

type OrganizeSession = ReturnType<typeof useOrganizeSession<AccountsGridRow>>;
type NormalContentProps = {
  props: AccountsPageViewProps;
  session: OrganizeSession;
  canOrganize: boolean;
};
type GridFeedbackProps = {
  props: Pick<
    AccountsPageViewProps,
    | "gainLoss"
    | "managementContext"
    | "unarchiveRecovery"
    | "onRefreshConstraints"
  >;
  organizer: Pick<OrganizeSession["organizer"], "load" | "loadError">;
  canOrganize: boolean;
};
function AccountsGridFeedback({
  props,
  organizer,
  canOrganize,
}: GridFeedbackProps) {
  const { gainLoss, managementContext = "accounts" } = props;
  const isCategories = managementContext === "categories";
  const { load } = organizer;
  return (
    <>
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
    </>
  );
}
function AccountsNormalContent({
  props,
  session,
  canOrganize,
}: NormalContentProps) {
  const { organizer, normalGrid, isOrganizing } = session;
  const { bulkAccountActions } = props;
  return (
    <Box
      style={{
        display: isOrganizing ? "none" : "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      <AccountsGridFeedback
        props={props}
        organizer={organizer}
        canOrganize={canOrganize}
      />
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
  );
}
function AccountsPageContent(props: AccountsPageViewProps) {
  const { bulkAccountActions, managementContext = "accounts" } = props;
  const isCategories = managementContext === "categories";
  const grouping = props.grouping ?? "accountStructure";
  const canOrganize = grouping === "accountStructure" && !!props.organizerApi;
  const session = useOrganizeSession<AccountsGridRow>({
    accountBookId: props.accountBookId,
    requested: !!props.organize,
    available: canOrganize,
    page: isCategories ? "categories" : "accounts",
    api: props.organizerApi,
    onSaved: props.onOrganizeSaved ?? (() => {}),
    onActivate: () => bulkAccountActions?.clearSelection(),
    refreshMetadata: props.onRefreshConstraints,
  });
  const { organizer, navigation, isOrganizing } = session;
  const [interactionBlocked, setInteractionBlocked] = useState(false);
  const editorOpened = props.createModalOpened || props.createGroupModalOpened;

  return (
    <PageShell>
      <AccountsPageHeader
        {...props}
        organizing={isOrganizing}
        managementPending={
          isOrganizing
            ? organizer.blocked || interactionBlocked || editorOpened
            : !!props.movingRow
        }
        onOrganize={
          canOrganize && !props.movingRow ? navigation.enter : undefined
        }
        organizePending={organizer.loading}
        organizerActions={
          <OrganizerActions
            organizer={organizer}
            blocked={editorOpened || interactionBlocked}
            onDone={navigation.exit}
          />
        }
      />
      {isOrganizing && (
        <HierarchyOrganizer
          accountBookId={props.accountBookId}
          organizer={organizer}
          creation={{
            editorOpened,
            onAddChild: (node) => props.onAddHierarchyChild?.(node, "account"),
            onAddGroup: (node) =>
              props.onAddHierarchyChild?.(node, "accountGroup"),
            onInteractionBlockedChange: setInteractionBlocked,
          }}
        />
      )}
      <AccountsNormalContent
        props={props}
        session={session}
        canOrganize={canOrganize}
      />
      {isOrganizing ? (
        <AccountOrganizeDialogs props={props} organizer={organizer} />
      ) : (
        <AccountsPageDialogs {...props} />
      )}
      <AccountRowMoveDialog props={props} />
    </PageShell>
  );
}
