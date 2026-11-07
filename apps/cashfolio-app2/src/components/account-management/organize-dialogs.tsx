import { AccountsPageDialogs } from "./page-dialogs";
import type { AccountsPageViewProps } from "./page-view-types";
import type { Organizer } from "@/components/hierarchy-organize/use-organizer";

export function AccountOrganizeDialogs({
  props,
  organizer,
}: {
  props: AccountsPageViewProps;
  organizer: Organizer;
}) {
  return (
    <AccountsPageDialogs
      {...props}
      onRefreshConstraints={organizer.refresh}
      editorSubmitState={{
        ...organizer.submitState,
        isSubmitting: organizer.pending,
      }}
      onSubmitCreateAccount={(values) =>
        organizer.performEdit(() => props.onSubmitCreateAccount(values))
      }
      onSubmitCreateGroup={(values) =>
        organizer.performEdit(() => props.onSubmitCreateGroup(values))
      }
    />
  );
}
