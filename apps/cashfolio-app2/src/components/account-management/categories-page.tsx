import { useState } from "react";
import { Alert, Button } from "@mantine/core";
import { PageShell } from "@/components/layout/page-shell";
import { HierarchyOrganizer } from "@/components/hierarchy-organize/organizer";
import { useHierarchyManagement } from "@/components/hierarchy-organize/use-hierarchy-management";
import { AccountsPageHeader } from "./page-header";
import { AccountsPageDialogs } from "./page-dialogs";
import type { AccountsPageViewProps } from "./page-view-types";
import { useExpandedGroups } from "@/hooks/use-expanded-groups";

export function CategoriesPageView(props: AccountsPageViewProps) {
  const organizer = useHierarchyManagement({
    accountBookId: props.accountBookId,
    page: "categories",
    api: props.organizerApi,
    onSaved: props.onOrganizeSaved ?? (() => {}),
    refreshMetadata: props.onRefreshConstraints,
  });
  const [interactionBlocked, setInteractionBlocked] = useState(false);
  const expansion = useExpandedGroups(
    `cashfolio:expandedGroups:${props.accountBookId}:active:${props.tab}`,
    undefined,
    true,
  );
  const editorOpened =
    props.createModalOpened ||
    props.createGroupModalOpened ||
    props.editModalOpen ||
    props.editGroupModalOpen;
  return (
    <PageShell>
      <AccountsPageHeader
        {...props}
        managementPending={
          organizer.blocked || interactionBlocked || editorOpened
        }
      />
      {organizer.loadError && (
        <Alert color="red" role="alert">
          {organizer.loadError}
          <Button variant="subtle" onClick={() => void organizer.load()}>
            Try Again
          </Button>
        </Alert>
      )}
      {organizer.snapshot && (
        <HierarchyOrganizer
          accountBookId={props.accountBookId}
          organizer={organizer}
          management={{
            addChildLabel:
              props.tab === "EQUITY-INCOME"
                ? "Add Income Category"
                : "Add Expense Category",
            editorOpened,
            expansion,
            showArchived: props.showArchived ?? false,
            onInteractionBlockedChange: setInteractionBlocked,
            onEdit: (node) => props.onEditHierarchyNode?.(node),
            onAddChild: (node) => props.onAddHierarchyChild?.(node, "account"),
            onAddGroup: (node) =>
              props.onAddHierarchyChild?.(node, "accountGroup"),
            onOpenLeaf: props.onOpenLedger,
          }}
        />
      )}
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
        onSubmitUpdateAccount={(values) =>
          organizer.performEdit(
            () => props.onSubmitUpdateAccount(values),
            props.editingAccount
              ? { id: props.editingAccount.id, nodeType: "account" }
              : undefined,
          )
        }
        onSubmitUpdateGroup={(values) =>
          organizer.performEdit(
            () => props.onSubmitUpdateGroup(values),
            props.editingGroup
              ? { id: props.editingGroup.id, nodeType: "accountGroup" }
              : undefined,
          )
        }
      />
    </PageShell>
  );
}
