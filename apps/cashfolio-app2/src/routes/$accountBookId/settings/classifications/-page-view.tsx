import {
  ActionIcon,
  Button,
  Group,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowDown,
  IconArrowUp,
  IconEdit,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { classificationOptions } from "@/shared/asset-class";
import { MutationSubmitFeedback } from "@/components/dialogs/mutation-submit-feedback";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import {
  ClassDialog,
  type ManagedClass,
  type ClassDraft,
} from "./-class-dialog";
export function ClassificationsPageView(props: {
  nodes: ManagedClass[];
  onSave: (draft: ClassDraft) => Promise<void>;
  onMove: (id: string, direction: "up" | "down") => Promise<void>;
  onDelete: (id: string, replacementId: string | null) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [dialog, setDialog] = useState<{
    draft: ClassDraft;
    deleting?: boolean;
  } | null>(null);
  const state = useDialogSubmitState({
    captureErrors: true,
    onRefreshConstraints: props.onRefresh,
  });
  const options = classificationOptions(props.nodes);
  return (
    <Stack style={{ overflow: "auto" }}>
      <Title order={2}>Classifications</Title>
      <Group justify="space-between">
        <Title order={3}>Asset Class</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setDialog({ draft: { name: "", parentId: null } })}
        >
          New Asset Class
        </Button>
      </Group>
      <Text size="sm" c="dimmed">
        Organize asset classes for gain/loss reports. Accounts can be assigned
        to any level. Changes apply to all historical periods.
      </Text>
      <MutationSubmitFeedback
        state={state}
        onRefreshConstraints={props.onRefresh}
      />
      <Table.ScrollContainer minWidth={600}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Asset Class</Table.Th>
              <Table.Th>Accounts</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {options.map((option) => {
              const node = props.nodes.find((n) => n.id === option.value)!;
              const siblings = options.filter(
                  (o) =>
                    props.nodes.find((n) => n.id === o.value)?.parentId ===
                    node.parentId,
                ),
                index = siblings.findIndex((n) => n.value === node.id);
              const hasChildren = props.nodes.some(
                (n) => n.parentId === node.id,
              );
              return (
                <Table.Tr key={node.id}>
                  <Table.Td>
                    <Text pl={option.depth * 20} title={option.label}>
                      {node.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {node.activeCount} active, {node.archivedCount} archived
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ActionIcon
                        variant="subtle"
                        aria-label={`Edit ${node.name}`}
                        onClick={() => setDialog({ draft: node })}
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        aria-label={`Add Child to ${node.name}`}
                        onClick={() =>
                          setDialog({ draft: { name: "", parentId: node.id } })
                        }
                      >
                        <IconPlus size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        aria-label={`Move ${node.name} Up`}
                        disabled={index === 0 || state.isSubmitting}
                        onClick={() =>
                          void state.runSubmit(() =>
                            props.onMove(node.id, "up"),
                          )
                        }
                      >
                        <IconArrowUp size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        aria-label={`Move ${node.name} Down`}
                        disabled={
                          index === siblings.length - 1 || state.isSubmitting
                        }
                        onClick={() =>
                          void state.runSubmit(() =>
                            props.onMove(node.id, "down"),
                          )
                        }
                      >
                        <IconArrowDown size={16} />
                      </ActionIcon>
                      <Tooltip
                        label={
                          hasChildren
                            ? "Move or delete child classes first"
                            : "Delete Asset Class"
                        }
                      >
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label={`Delete ${node.name}`}
                          disabled={hasChildren}
                          onClick={() =>
                            setDialog({ draft: node, deleting: true })
                          }
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {!props.nodes.length && (
        <Text>No asset classes. Create one to start classifying accounts.</Text>
      )}
      <Text size="sm" c="dimmed">
        Accounts without an assignment appear as Unclassified.
      </Text>
      {dialog && (
        <ClassDialog
          {...dialog}
          nodes={props.nodes}
          onClose={() => setDialog(null)}
          onRefresh={props.onRefresh}
          onSave={props.onSave}
          onDelete={props.onDelete}
        />
      )}
    </Stack>
  );
}
