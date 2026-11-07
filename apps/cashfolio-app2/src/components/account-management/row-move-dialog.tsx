import { Alert, Button } from "@mantine/core";
import { useEffect } from "react";
import { MoveDialog } from "@/components/hierarchy-organize/move-dialog";
import { useOrganizer } from "@/components/hierarchy-organize/use-organizer";
import { useOrganizeNavigationGuard } from "@/components/hierarchy-organize/use-organize-navigation-guard";
import { useGlobalLoading } from "@/components/navigation/global-loading";
import type { AccountsPageViewProps } from "./page-view-types";

export function AccountRowMoveDialog({
  props,
}: {
  props: AccountsPageViewProps;
}) {
  const organizer = useOrganizer(
    props.onOrganizeSaved ?? (() => {}),
    props.organizerApi,
    false,
    props.onRefreshConstraints,
  );
  const { load, reset } = organizer;
  const target = props.movingRow;
  useEffect(() => {
    if (target) void load();
    else reset();
  }, [target, load, reset]);
  useGlobalLoading(organizer.loading || organizer.submitState.isRefreshing);
  useOrganizeNavigationGuard(
    props.accountBookId,
    organizer.pending,
    "accounts",
  );
  const node = organizer.snapshot?.nodes.find((node) => node.id === target?.id);
  return (
    <>
      {target && organizer.loadError && (
        <Alert color="red" role="alert">
          {organizer.loadError}
          <Button variant="subtle" onClick={() => void load()}>
            Try Again
          </Button>
          <Button variant="subtle" onClick={props.onCloseMove}>
            Cancel
          </Button>
        </Alert>
      )}
      <MoveDialog
        nodes={organizer.snapshot?.nodes ?? []}
        items={target && organizer.snapshot ? [target] : undefined}
        showArchived={node?.isActive === false}
        pending={organizer.pending}
        blocked={organizer.blocked}
        submission={{
          state: organizer.submitState,
          onRefreshConstraints: organizer.refresh,
          retryDisabled: organizer.retryDisabled,
        }}
        onClose={() => {
          if (!organizer.pending) props.onCloseMove?.();
        }}
        onMove={organizer.saveMove}
        formatErrorMessage={organizer.formatErrorMessage}
      />
    </>
  );
}
