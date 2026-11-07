import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import type { ColDef } from "ag-grid-enterprise";
import { useState } from "react";
import { HierarchyOrganizer } from "@/components/hierarchy-organize/organizer";
import { useHierarchyManagement } from "@/components/hierarchy-organize/use-hierarchy-management";
import type { OrganizerApi } from "@/components/hierarchy-organize/use-organizer";
import type { OrganizeDisplayRow } from "@/shared/hierarchy-organize/tree";
import {
  ClassDialog,
  type ManagedClass,
  type ClassDraft,
} from "./-class-dialog";

const COLUMNS: ColDef<OrganizeDisplayRow>[] = [
  {
    colId: "accounts",
    headerName: "Accounts",
    width: 230,
    minWidth: 210,
    valueGetter: ({ data }) =>
      data?.nodeType === "assetClass"
        ? `${data.activeCount} active, ${data.archivedCount} archived`
        : "",
  },
];
export type ClassificationsPageProps = {
  accountBookId?: string;
  organizerApi?: OrganizerApi;
  nodes: ManagedClass[];
  onSave: (draft: ClassDraft) => Promise<void>;
  onDelete: (id: string, replacementId: string | null) => Promise<void>;
  onRefresh: () => Promise<void>;
};
export function ClassificationsPageView(props: ClassificationsPageProps) {
  return <ClassificationsPageContent key={props.accountBookId} {...props} />;
}
function ClassificationsPageContent(props: ClassificationsPageProps) {
  const organizer = useHierarchyManagement({
    accountBookId: props.accountBookId ?? "storybook",
    page: "assetClasses",
    api: props.organizerApi,
    onSaved: () => {},
    refreshMetadata: props.onRefresh,
  });
  const [dialog, setDialog] = useState<ClassDraft | null>(null);
  const [interactionBlocked, setInteractionBlocked] = useState(false);
  const nodes =
    organizer.snapshot?.nodes.filter(
      (node) => node.nodeType === "assetClass",
    ) ?? props.nodes;
  return (
    <Stack flex={1} mih={0}>
      <Group justify="end">
        <Button
          leftSection={<IconPlus size={16} />}
          disabled={organizer.blocked || interactionBlocked || !!dialog}
          onClick={() => setDialog({ name: "", parentId: null })}
        >
          New Asset Class
        </Button>
      </Group>
      <Text size="sm" c="dimmed">
        Organize asset classes for gain/loss reports. Accounts can be assigned
        to any level. Changes apply to all historical periods.
      </Text>
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
          accountBookId={props.accountBookId ?? "storybook"}
          organizer={organizer}
          management={{
            editorOpened: !!dialog,
            columns: COLUMNS,
            onInteractionBlockedChange: setInteractionBlocked,
            onEdit: (node) => setDialog(node),
            onAddChild: (node) => setDialog({ name: "", parentId: node.id }),
          }}
          renderLifecycleDialog={(target, close) =>
            target?.action === "delete" &&
            target.node.nodeType === "assetClass" ? (
              <ClassDialog
                draft={target.node}
                deleting
                nodes={nodes}
                onClose={close}
                onRefresh={organizer.refresh}
                onSave={props.onSave}
                submitState={{
                  ...organizer.submitState,
                  isSubmitting: organizer.pending,
                }}
                onDelete={(id, replacementId) =>
                  organizer.performLifecycle(
                    "delete",
                    { id, nodeType: "assetClass" },
                    close,
                    replacementId,
                  )
                }
              />
            ) : null
          }
        />
      )}
      <Text size="sm" c="dimmed">
        Accounts without an assignment appear as Unclassified.
      </Text>
      {dialog && (
        <ClassDialog
          draft={dialog}
          nodes={nodes}
          onClose={() => setDialog(null)}
          onRefresh={organizer.refresh}
          onDelete={props.onDelete}
          submitState={{
            ...organizer.submitState,
            isSubmitting: organizer.pending,
          }}
          onSave={(draft) =>
            organizer.performEdit(
              () => props.onSave(draft),
              draft.id ? { id: draft.id, nodeType: "assetClass" } : undefined,
              () => setDialog(null),
            )
          }
        />
      )}
    </Stack>
  );
}
