import { getAccountConstraintMessage } from "@/shared/account-presentation";
import { AccountsPageDialogs } from "./page-dialogs";
import type { AccountsPageViewProps } from "./page-view-types";
import type { Organizer } from "@/components/hierarchy-organize/use-organizer";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import { useOrganizeNavigationGuard } from "@/components/hierarchy-organize/use-organize-navigation-guard";

export function AccountOrganizeDialogs({
  props,
  organizer,
}: {
  props: AccountsPageViewProps;
  organizer?: Organizer;
}) {
  const internalSubmitState = useDialogSubmitState({
    captureErrors: true,
    formatErrorMessage: (message) =>
      getAccountConstraintMessage(message, "accounts") ?? message,
    onRefreshConstraints: props.onRefreshConstraints,
  });
  const normalSubmitState = props.editorSubmitState ?? internalSubmitState;
  // Finish a normal editor submission/recovery before switching controllers.
  useOrganizeNavigationGuard(
    props.accountBookId,
    normalSubmitState.isSubmitting || normalSubmitState.isRefreshing,
    "accounts",
  );
  // Keep editor instances mounted when browser history changes the page mode.
  const dialogProps: AccountsPageViewProps = organizer
    ? {
        ...props,
        onRefreshConstraints: organizer.refresh,
        editorSubmitState: {
          ...organizer.submitState,
          isSubmitting: organizer.pending,
        },
        onSubmitCreateAccount: (values) =>
          organizer.performEdit(() => props.onSubmitCreateAccount(values)),
        onSubmitCreateGroup: (values) =>
          organizer.performEdit(() => props.onSubmitCreateGroup(values)),
        onSubmitUpdateAccount: (values) =>
          organizer.performEdit(
            () => props.onSubmitUpdateAccount(values),
            props.editingAccount
              ? { id: props.editingAccount.id, nodeType: "account" }
              : undefined,
          ),
        onSubmitUpdateGroup: (values) =>
          organizer.performEdit(
            () => props.onSubmitUpdateGroup(values),
            props.editingGroup
              ? { id: props.editingGroup.id, nodeType: "accountGroup" }
              : undefined,
          ),
      }
    : { ...props, editorSubmitState: normalSubmitState };
  return <AccountsPageDialogs {...dialogProps} />;
}
