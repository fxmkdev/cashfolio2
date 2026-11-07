import { Badge, Group, Title } from "@mantine/core";
import { OrganizerActions } from "@/components/hierarchy-organize/organizer-actions";
import { PageShell } from "@/components/layout/page-shell";
import { AccountsPageBody } from "../-page-body";
import { AccountsGroupingControl, AccountsPageActions } from "../-page-header";
import { AccountsPageView } from "../-page-view";
import type { AccountsPageViewProps } from "../-page-view-types";
import { useAccountsPageInteractions } from "../-use-page-interactions";

/** Experimental composition only; the fixtures and callbacks come from the harness. */
export function ControlsRowAccountsLayout(props: AccountsPageViewProps) {
  if (props.managementContext === "categories")
    return <AccountsPageView {...props} />;
  return (
    <ControlsRowContent
      key={`${props.accountBookId}:${props.managementContext ?? "accounts"}:${props.tab}`}
      {...props}
    />
  );
}

function ControlsRowContent(props: AccountsPageViewProps) {
  const interactions = useAccountsPageInteractions(props);
  const { organizer, navigation, canOrganize, isOrganizing } = interactions;
  return (
    <PageShell>
      <Title order={2} mb="md">
        Accounts
      </Title>
      <Group justify="space-between" gap="md" mb="md">
        {isOrganizing ? (
          <>
            <Badge variant="light" size="lg">
              Organizing
            </Badge>
            <OrganizerActions organizer={organizer} onDone={navigation.exit} />
          </>
        ) : (
          <>
            <AccountsGroupingControl {...props} />
            <AccountsPageActions
              {...props}
              onOrganize={canOrganize ? navigation.enter : undefined}
              organizePending={organizer.loading}
            />
          </>
        )}
      </Group>
      <AccountsPageBody props={props} interactions={interactions} />
    </PageShell>
  );
}
