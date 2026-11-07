import { OrganizerActions } from "@/components/hierarchy-organize/organizer-actions";
import { PageShell } from "@/components/layout/page-shell";
import { AccountsPageHeader } from "./-page-header";
import { AccountsPageBody } from "./-page-body";
import { useAccountsPageInteractions } from "./-use-page-interactions";
import type { AccountsPageViewProps } from "./-page-view-types";
import { CategoriesPageView } from "./-categories-page";
export type { AccountsPageViewProps } from "./-page-view-types";

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

function AccountsPageContent(props: AccountsPageViewProps) {
  const interactions = useAccountsPageInteractions(props);
  const { organizer, navigation, canOrganize, isOrganizing } = interactions;
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
      <AccountsPageBody props={props} interactions={interactions} />
    </PageShell>
  );
}
