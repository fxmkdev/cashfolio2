import { useAssetClasses } from "@/classification-context";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useState } from "react";

import { AssetClassTreeSelect } from "@/components/controls/asset-class-tree-select";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import { MutationSubmitFeedback } from "@/components/dialogs/mutation-submit-feedback";
import type { AccountBulkActionTarget } from "./-bulk-account-targets";

export function AssetClassAssignmentDialog(props: {
  target: AccountBulkActionTarget;
  onClose: () => void;
  onSubmit: (assetClassId: string | null) => Promise<void>;
  onRefreshConstraints?: () => Promise<void>;
}) {
  const nodes = useAssetClasses();
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
            props.onSubmit(value === "unclassified" ? null : (value as string)),
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
          <AssetClassTreeSelect
            openOnFocus={false}
            searchable
            label="Asset Class"
            placeholder="Select asset class"
            nodes={nodes}
            unclassifiedValue="unclassified"
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
