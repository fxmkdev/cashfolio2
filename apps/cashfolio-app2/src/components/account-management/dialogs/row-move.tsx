import { useEffect } from "react";
import { MoveDialog } from "@/components/hierarchy-organize/move-dialog";
import { useOrganizer } from "@/components/hierarchy-organize/use-organizer";
import { useOrganizeNavigationGuard } from "@/components/hierarchy-organize/use-organize-navigation-guard";
import { useGlobalLoading } from "@/components/navigation/global-loading";
import type { AccountsPageViewProps } from "../view-types";

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
    <MoveDialog
      nodes={organizer.snapshot?.nodes ?? []}
      items={target ? [target] : undefined}
      initialLoad={
        target && !organizer.snapshot
          ? {
              loading: organizer.loading,
              error: organizer.loadError,
              onRetry: () => void load(),
            }
          : undefined
      }
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
  );
}
