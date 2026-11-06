import { moveSummary } from "./move-summary";
import {
  Alert,
  Button,
  Group,
  Input,
  Modal,
  Select,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { useId, useMemo, useState } from "react";
import type { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import { MutationSubmitFeedback } from "@/components/dialogs/mutation-submit-feedback";
import { GroupTreeSelect } from "@/components/account-tree/group-tree-select";
import {
  moveDestinationGroups,
  TOP_LEVEL_DESTINATION,
} from "./move-destinations";
import {
  descendants,
  compareOrganizeNodes,
  normalizeOrganizeSelection,
} from "@/shared/hierarchy-organize/tree";
import { planOrganizeMove } from "@/shared/hierarchy-organize/move";
import type {
  OrganizeMove,
  OrganizeNode,
  OrganizeNodeRef,
  OrganizePlacement,
} from "@/shared/hierarchy-organize/types";

type MoveDialogProps = {
  nodes: OrganizeNode[];
  showArchived?: boolean;
  items?: OrganizeNodeRef[];
  pending: boolean;
  blocked?: boolean;
  submission?: {
    state: ReturnType<typeof useDialogSubmitState>;
    onRefreshConstraints: () => Promise<void>;
    retryDisabled: boolean;
  };
  onClose: () => void;
  onMove: (move: OrganizeMove) => Promise<boolean | undefined>;
};

export function MoveDialog(props: MoveDialogProps) {
  // Keep the shell mounted so Mantine captures the trigger on opening and
  // returns focus on closing; reset destination choices with the content.
  return (
    <Modal
      opened={!!props.items}
      onClose={props.onClose}
      title="Move To…"
      closeOnEscape={!props.pending}
      closeOnClickOutside={!props.pending}
      withCloseButton={!props.pending}
    >
      {props.items && <MoveDialogContent {...props} items={props.items} />}
    </Modal>
  );
}

function MoveDialogContent({
  nodes,
  showArchived = true,
  items,
  pending,
  blocked = pending,
  submission,
  onClose,
  onMove,
}: MoveDialogProps & { items: OrganizeNodeRef[] }) {
  const positionLabelId = useId();
  const [parent, setParent] = useState<string | null>(null);
  const [placement, setPlacement] = useState<OrganizePlacement>("last");
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const available = items.filter((item) =>
    nodes.some(
      (node) => node.id === item.id && node.nodeType === item.nodeType,
    ),
  );
  const missing = available.length !== items.length;
  const roots = normalizeOrganizeSelection(nodes, available);
  const included = new Set(
    roots.flatMap((node) => [...descendants(nodes, node.id)]),
  );
  const archivedDescendants = nodes.filter(
    (node) =>
      included.has(node.id) &&
      !roots.some((root) => root.id === node.id) &&
      node.isActive === false,
  ).length;
  const makeMove = (
    parentId: string | null,
    position = placement,
    anchor = anchorId,
  ): OrganizeMove => ({
    items,
    parentId,
    placement: position,
    ...(anchor ? { anchorId: anchor } : {}),
  });
  const destinations = useMemo(
    () => moveDestinationGroups(nodes, items, showArchived),
    [nodes, items, showArchived],
  );
  const anchors = nodes
    .filter(
      (node) =>
        node.parentId === parent &&
        !included.has(node.id) &&
        (showArchived || node.isActive !== false),
    )
    .sort(compareOrganizeNodes)
    .filter((node) => {
      try {
        planOrganizeMove(nodes, makeMove(parent, "before", node.id));
        return true;
      } catch {
        return false;
      }
    })
    .map((node) => ({
      value: node.id,
      label: `${node.name}${node.isActive === false ? " (Archived)" : ""}`,
    }));
  const preview = useMemo(() => {
    try {
      if (missing)
        throw new Error(
          "A selected item is no longer available. Close this dialog and select the updated items.",
        );
      const next = planOrganizeMove(nodes, {
        items,
        parentId: parent,
        placement,
        ...(anchorId ? { anchorId } : {}),
      });
      return { effect: moveSummary(nodes, next), error: undefined };
    } catch (error) {
      return {
        effect: "",
        error: error instanceof Error ? error.message : "Choose a destination.",
      };
    }
  }, [nodes, items, parent, placement, anchorId, missing]);
  const submitMove = async () => {
    if (preview.error || blocked) return;
    if (await onMove(makeMove(parent))) onClose();
  };
  return (
    <Stack>
      <Text>
        {roots.length} selected {roots.length === 1 ? "item" : "items"};{" "}
        {included.size - roots.length} included descendants
        {archivedDescendants ? ` (${archivedDescendants} archived)` : ""}.
      </Text>
      <GroupTreeSelect
        label="Destination"
        searchable
        allowDeselect={false}
        groups={destinations}
        value={parent ?? TOP_LEVEL_DESTINATION}
        disabled={blocked}
        onChange={(value) => {
          setParent(value === TOP_LEVEL_DESTINATION ? null : value);
          setAnchorId(null);
        }}
      />
      <Stack gap={4}>
        <Input.Label id={positionLabelId}>Position</Input.Label>
        <SegmentedControl<OrganizePlacement>
          aria-labelledby={positionLabelId}
          fullWidth
          value={placement}
          disabled={blocked}
          data={[
            { value: "first", label: "First" },
            { value: "last", label: "Last" },
            { value: "before", label: "Before", disabled: !anchors.length },
            { value: "after", label: "After", disabled: !anchors.length },
          ]}
          onChange={(value) => {
            setPlacement(value);
            setAnchorId(null);
          }}
        />
      </Stack>
      {(placement === "before" || placement === "after") && (
        <Select
          label="Sibling"
          searchable
          data={anchors}
          value={anchorId}
          onChange={setAnchorId}
          disabled={blocked}
        />
      )}
      {preview.effect && <Alert color="blue">{preview.effect}</Alert>}
      {preview.error && (
        <Text c="dimmed" size="sm">
          {preview.error}
        </Text>
      )}
      {submission && (
        <MutationSubmitFeedback
          {...submission}
          onRetry={() => void submitMove()}
          retryDisabled={submission.retryDisabled || !!preview.error || blocked}
        />
      )}
      <Group justify="flex-end">
        <Button variant="default" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!!preview.error || blocked}
          loading={pending}
          onClick={() => void submitMove()}
        >
          Move
        </Button>
      </Group>
    </Stack>
  );
}
