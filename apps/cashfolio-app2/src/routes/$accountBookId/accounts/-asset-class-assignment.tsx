import { Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { useState } from "react";
import type { AssetClass } from "@/.prisma-client/enums";
import { assetClassOptions } from "@/shared/asset-class";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import { MutationSubmitFeedback } from "@/components/dialogs/mutation-submit-feedback";
import type { AssetClassAssignment } from "./-use-asset-class-assignment";
import type { AssetClassAssignmentTarget } from "./-asset-class-targets";

export function AssetClassAssignmentToolbar({
  actions,
}: {
  actions: AssetClassAssignment;
}) {
  if (!actions.selectedCount) return null;
  return (
    <Group mb="sm" role="toolbar" aria-label="Selected Account Actions">
      <Text size="sm" role="status">
        {actions.selectedCount}{" "}
        {actions.selectedCount === 1 ? "account" : "accounts"} selected
      </Text>
      <Button variant="light" onClick={actions.openSelected}>
        Set Asset Class
      </Button>
      <Button variant="subtle" onClick={actions.clearSelection}>
        Clear Selection
      </Button>
    </Group>
  );
}

export function AssetClassAssignmentDialog(props: {
  target: AssetClassAssignmentTarget;
  onClose: () => void;
  onSubmit: (assetClass: AssetClass | null) => Promise<void>;
  onRefreshConstraints?: () => Promise<void>;
}) {
  const [value, setValue] = useState<string | null>(null);
  const state = useDialogSubmitState({
    captureErrors: true,
    onRefreshConstraints: props.onRefreshConstraints,
  });
  const count = props.target.accountIds.length;
  return (
    <Modal
      opened
      onClose={() => {
        if (!state.isSubmitting) props.onClose();
      }}
      title="Set Asset Class"
      closeOnEscape={!state.isSubmitting}
      closeOnClickOutside={!state.isSubmitting}
      withCloseButton={!state.isSubmitting}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (value === null) return;
          void state.runSubmit(() =>
            props.onSubmit(
              value === "unclassified" ? null : (value as AssetClass),
            ),
          );
        }}
      >
        <Stack>
          <Text size="sm">
            Update {count} {count === 1 ? "account" : "accounts"} (
            {props.target.archivedCount} archived).
          </Text>
          <Text size="sm">
            This replaces existing classifications and applies to all historical
            periods in Report and History.
          </Text>
          <Select
            label="Asset Class"
            placeholder="Select asset class"
            data={[
              { value: "unclassified", label: "Unclassified" },
              ...assetClassOptions,
            ]}
            value={value}
            onChange={(next) => {
              setValue(next);
              state.clearSubmissionError();
            }}
            disabled={state.isSubmitting}
            data-autofocus
          />
          <MutationSubmitFeedback
            state={state}
            onRefreshConstraints={props.onRefreshConstraints}
            retryDisabled={value === null}
          />
          <Group justify="end">
            <Button
              variant="subtle"
              onClick={props.onClose}
              disabled={state.isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={state.isSubmitting}
              disabled={
                value === null || state.isSubmitting || state.isRefreshing
              }
            >
              Apply
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
