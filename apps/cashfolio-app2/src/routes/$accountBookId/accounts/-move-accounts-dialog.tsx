import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { GroupTreeSelect } from "@/components/account-tree/group-tree-select";
import { MutationSubmitFeedback } from "@/components/dialogs/mutation-submit-feedback";
import { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import {
  getAccountMoveError,
  getMoveCashFlowChanges,
  getMovingAccounts,
  type MoveAccountsInput,
} from "@/shared/bulk-account-move";
import type { TreeRow } from "./-page-types";
import type { AccountBulkActionTarget } from "./-bulk-account-targets";
import {
  buildMoveGroupOptions,
  getMoveAccountsData,
  NO_GROUP_VALUE,
} from "./-move-accounts-data";

export function MoveAccountsDialog(props: {
  target: AccountBulkActionTarget;
  rows: TreeRow[];
  existingAccounts: { id: string; name: string; groupId: string | null }[];
  onClose: () => void;
  onSubmit: (
    data: Pick<MoveAccountsInput, "targetGroupId" | "expectedCashFlowChanges">,
  ) => Promise<void>;
  onRefreshConstraints?: () => Promise<void>;
}) {
  const [value, setValue] = useState<string | null>(null);
  const state = useDialogSubmitState({
    captureErrors: true,
    onRefreshConstraints: props.onRefreshConstraints,
  });
  const { accounts, groups } = getMoveAccountsData(
    props.rows,
    props.target.accountIds,
  );
  const options = buildMoveGroupOptions(accounts, groups);
  const group = groups.find((group) => group.id === value) ?? null;
  const targetGroupId = value === NO_GROUP_VALUE ? null : value;
  const available =
    value !== null && options.some((option) => option.value === value);
  const error =
    accounts.length !== props.target.accountIds.length
      ? "One or more selected accounts are no longer available. Refresh choices and try again."
      : value !== null && !available
        ? "The selected destination is no longer compatible. Choose another group."
        : available
          ? getAccountMoveError(
              accounts,
              group,
              props.existingAccounts.filter(
                (account) => account.groupId === targetGroupId,
              ),
            )
          : null;
  const moving = getMovingAccounts(accounts, targetGroupId);
  const changes = getMoveCashFlowChanges(accounts, group);
  const disabled = !available || !!error || !moving.length;
  const count = props.target.accountIds.length;
  const names = (ids: string[]) =>
    accounts
      .filter((account) => ids.includes(account.id))
      .map((account) => account.name)
      .join(", ");

  return (
    <Modal
      opened
      title="Move to Group"
      onClose={() => {
        if (!state.isSubmitting) props.onClose();
      }}
      closeOnEscape={!state.isSubmitting}
      closeOnClickOutside={!state.isSubmitting}
      withCloseButton={!state.isSubmitting}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) return;
          void state.runSubmit(() =>
            props.onSubmit({ targetGroupId, expectedCashFlowChanges: changes }),
          );
        }}
      >
        <Stack>
          <Text size="sm" tabIndex={-1} data-autofocus>
            {count} {count === 1 ? "account" : "accounts"} selected (
            {props.target.archivedCount} archived).
          </Text>
          <GroupTreeSelect
            label="Destination Group"
            placeholder="Select destination group"
            groups={options}
            value={value}
            onChange={(next) => {
              setValue(next);
              state.clearSubmissionError();
            }}
            error={error}
            disabled={state.isSubmitting}
          />
          {available && !error && (
            <>
              <Text size="sm">
                {moving.length}{" "}
                {moving.length === 1 ? "account will" : "accounts will"} move.{" "}
                {accounts.length - moving.length} already in this destination.
              </Text>
              {value === NO_GROUP_VALUE ? (
                <Text size="sm">
                  Moving to No Group preserves each account’s current cash-flow
                  inclusion.
                </Text>
              ) : (
                <Text size="sm">
                  Cash-flow inclusion is inherited from the destination group.
                  Moving accounts changes their grouping in historical reports.
                </Text>
              )}
              {(changes.includedAccountIds.length > 0 ||
                changes.excludedAccountIds.length > 0) && (
                <Alert color="yellow" title="Cash Flow Changes">
                  <Stack gap="xs">
                    {changes.includedAccountIds.length > 0 && (
                      <Text size="sm">
                        {changes.includedAccountIds.length} will be included in
                        cash flow: {names(changes.includedAccountIds)}.
                      </Text>
                    )}
                    {changes.excludedAccountIds.length > 0 && (
                      <Text size="sm">
                        {changes.excludedAccountIds.length} will be excluded
                        from cash flow: {names(changes.excludedAccountIds)}.
                      </Text>
                    )}
                    <Text size="sm">
                      This changes Cash Flow for all historical periods.
                    </Text>
                  </Stack>
                </Alert>
              )}
            </>
          )}
          <MutationSubmitFeedback
            state={state}
            onRefreshConstraints={props.onRefreshConstraints}
            retryDisabled={disabled}
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
              disabled={disabled || state.isSubmitting || state.isRefreshing}
            >
              Move
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
