import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import {
  classificationOptions,
  type ClassificationNode,
} from "@/shared/asset-class";
import { validateClassificationChange } from "@/shared/classification-rules";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import { MutationSubmitFeedback } from "@/components/dialogs/mutation-submit-feedback";
export type ManagedClass = ClassificationNode & {
  activeCount: number;
  archivedCount: number;
};
export type ClassDraft = { id?: string; name: string; parentId: string | null };
export function ClassDialog(props: {
  nodes: ManagedClass[];
  draft: ClassDraft;
  deleting?: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSave: (draft: ClassDraft) => Promise<void>;
  onDelete: (id: string, replacementId: string | null) => Promise<void>;
}) {
  const [name, setName] = useState(props.draft.name),
    [parentId, setParentId] = useState<string | null>(props.draft.parentId),
    [replacement, setReplacement] = useState<string | null>(null);
  const state = useDialogSubmitState({
    captureErrors: true,
    onRefreshConstraints: props.onRefresh,
  });
  const current = props.nodes.find((n) => n.id === props.draft.id);
  const options = classificationOptions(props.nodes);
  const parentOptions = options.filter((n) => {
    let id: string | null = n.value;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      if (id === props.draft.id) return false;
      seen.add(id);
      id = props.nodes.find((node) => node.id === id)?.parentId ?? null;
    }
    return true;
  });
  const close = () => {
    if (!state.isSubmitting) props.onClose();
  };
  return (
    <Modal
      opened
      onClose={close}
      title={
        props.deleting
          ? "Delete Asset Class"
          : props.draft.id
            ? "Edit Asset Class"
            : "New Asset Class"
      }
      closeOnEscape={!state.isSubmitting}
      closeOnClickOutside={!state.isSubmitting}
      withCloseButton={!state.isSubmitting}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void state.runSubmit(async () => {
            if (props.deleting) {
              if (replacement === null)
                throw new Error("Choose a replacement class or Unclassified.");
              await props.onDelete(
                props.draft.id!,
                replacement === "unclassified" ? null : replacement,
              );
            } else {
              const draft = { id: props.draft.id, name: name.trim(), parentId };
              validateClassificationChange(props.nodes, draft);
              await props.onSave(draft);
            }
            props.onClose();
          });
        }}
      >
        <Stack>
          {props.deleting ? (
            <>
              <Text>Delete {current?.name ?? props.draft.name}?</Text>
              <Text size="sm">
                Reassign {current?.activeCount ?? 0} active and{" "}
                {current?.archivedCount ?? 0} archived accounts. This applies to
                all historical reports.
              </Text>
              <Select
                label="Replacement Asset Class"
                placeholder="Choose a replacement"
                searchable
                value={replacement}
                onChange={setReplacement}
                data={[
                  { value: "unclassified", label: "Unclassified" },
                  ...options.filter((n) => n.value !== props.draft.id),
                ]}
                disabled={state.isSubmitting}
              />
            </>
          ) : (
            <>
              <TextInput
                label="Name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                disabled={state.isSubmitting}
                required
                data-autofocus
              />
              <Select
                label="Parent Class"
                placeholder="Top Level"
                searchable
                clearable
                value={parentId}
                onChange={setParentId}
                data={parentOptions}
                disabled={state.isSubmitting}
              />
            </>
          )}
          <MutationSubmitFeedback
            state={state}
            onRefreshConstraints={props.onRefresh}
          />
          <Group justify="end">
            <Button
              variant="subtle"
              onClick={close}
              disabled={state.isSubmitting}
            >
              Cancel
            </Button>
            <Button
              color={props.deleting ? "red" : undefined}
              type="submit"
              loading={state.isSubmitting}
              disabled={
                state.isRefreshing || (props.deleting && replacement === null)
              }
            >
              {props.deleting ? "Delete" : "Save"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
