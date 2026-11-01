import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useMemo, useState } from "react";
import {
  descendants,
  normalizeOrganizeSelection,
  organizePath,
} from "@/shared/account-organize/tree";
import { planAccountMove } from "@/shared/account-organize/move";
import type {
  OrganizeMove,
  OrganizeNode,
  OrganizeNodeRef,
  OrganizePlacement,
} from "@/shared/account-organize/types";

export function moveSummary(nodes: OrganizeNode[], next: OrganizeNode[]) {
  const changed = next.filter(
    (node, i) => node.isCashAccount !== nodes[i].isCashAccount,
  );
  return changed.length
    ? `This move changes the Cash Account setting for ${changed.length} ${changed.length === 1 ? "item" : "items"}, including descendants, to match the destination group.`
    : "";
}

export function MoveDialog({
  nodes,
  items,
  pending,
  onClose,
  onMove,
}: {
  nodes: OrganizeNode[];
  items: OrganizeNodeRef[];
  pending: boolean;
  onClose: () => void;
  onMove: (move: OrganizeMove) => Promise<boolean | undefined>;
}) {
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
  const destinations = [
    { value: "__top_level__", label: "Top Level" },
    ...nodes
      .filter(
        (node) => node.nodeType === "accountGroup" && !included.has(node.id),
      )
      .map((node) => ({
        value: node.id,
        label: `${organizePath(nodes, node.id)}${node.isActive ? "" : " (Archived)"}`,
      })),
  ].filter((option) => {
    try {
      planAccountMove(
        nodes,
        makeMove(
          option.value === "__top_level__" ? null : option.value,
          "last",
          null,
        ),
      );
      return true;
    } catch {
      return false;
    }
  });
  const anchors = nodes
    .filter((node) => node.parentId === parent && !included.has(node.id))
    .filter((node) => {
      try {
        planAccountMove(nodes, makeMove(parent, "before", node.id));
        return true;
      } catch {
        return false;
      }
    })
    .map((node) => ({
      value: node.id,
      label: `${node.name}${node.isActive ? "" : " (Archived)"}`,
    }));
  const preview = useMemo(() => {
    try {
      if (missing)
        throw new Error(
          "A selected item is no longer available. Close this dialog and select the updated items.",
        );
      const next = planAccountMove(nodes, {
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
  return (
    <Modal
      opened
      onClose={onClose}
      title="Move To…"
      closeOnEscape={!pending}
      closeOnClickOutside={!pending}
      withCloseButton={!pending}
    >
      <Stack>
        <Text>
          {roots.length} selected {roots.length === 1 ? "item" : "items"};{" "}
          {included.size - roots.length} included descendants.
        </Text>
        <Select
          label="Destination"
          searchable
          allowDeselect={false}
          data={destinations}
          value={parent ?? "__top_level__"}
          disabled={pending}
          onChange={(value) => {
            setParent(value === "__top_level__" ? null : value);
            setAnchorId(null);
          }}
        />
        <Select
          label="Position"
          allowDeselect={false}
          value={placement}
          disabled={pending}
          data={[
            { value: "first", label: "First" },
            { value: "last", label: "Last" },
            { value: "before", label: "Before", disabled: !anchors.length },
            { value: "after", label: "After", disabled: !anchors.length },
          ]}
          onChange={(value) => {
            setPlacement(value as OrganizePlacement);
            setAnchorId(null);
          }}
        />
        {(placement === "before" || placement === "after") && (
          <Select
            label="Sibling"
            searchable
            data={anchors}
            value={anchorId}
            onChange={setAnchorId}
            disabled={pending}
          />
        )}
        {preview.effect && <Alert color="blue">{preview.effect}</Alert>}
        {preview.error && (
          <Text c="dimmed" size="sm">
            {preview.error}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!!preview.error || pending}
            loading={pending}
            onClick={async () => {
              if (await onMove(makeMove(parent))) onClose();
            }}
          >
            Move
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
