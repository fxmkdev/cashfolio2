import { AccountsPageDialogs } from "./dialogs";
import type { AccountsPageViewProps } from "../view-types";
import type { Organizer } from "@/components/hierarchy-organize/use-organizer";

export function AccountOrganizeDialogs({
  props,
  organizer,
}: {
  props: AccountsPageViewProps;
  organizer?: Organizer;
}) {
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
    : props;
  return <AccountsPageDialogs {...dialogProps} />;
}
