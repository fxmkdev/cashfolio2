import { useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";
import type { AccountTrackingMethod } from "@/.prisma-client/enums";
import type { BulkAccountActionOptions } from "./bulk-account-action-types";
import type { useBulkAccountSelection } from "./use-bulk-account-selection";
import {
  createAccountBulkActionTarget,
  createTrackingMethodBulkActionTarget,
  type AccountBulkActionTarget,
  type TrackingMethodBulkActionTarget,
} from "./bulk-account-targets";
type Selection = ReturnType<typeof useBulkAccountSelection>;

async function applyTrackingMethod(
  args: BulkAccountActionOptions,
  target: TrackingMethodBulkActionTarget,
  value: AccountTrackingMethod,
  onSuccess: () => void,
) {
  await args.submitTrackingMethod(target.accountIds, value);
  onSuccess();
  args.invalidate();
  const count = target.accountIds.length;
  notifications.show({
    color: "green",
    message: `Tracking method updated for ${count} ${count === 1 ? "account" : "accounts"}.`,
  });
}

async function applyAssetClass(
  args: BulkAccountActionOptions,
  target: AccountBulkActionTarget,
  value: string | null,
  onSuccess: () => void,
) {
  await args.submitAssetClass(target.accountIds, value);
  onSuccess();
  args.invalidate();
  const count = target.accountIds.length;
  notifications.show({
    color: "green",
    message: `Asset class updated for ${count} ${count === 1 ? "account" : "accounts"}.`,
  });
}

export function useBulkAssignmentActions(
  args: BulkAccountActionOptions,
  selection: Selection,
) {
  const [assetClassTarget, setAssetClassTarget] =
    useState<AccountBulkActionTarget>();
  const [trackingMethodTarget, setTrackingMethodTarget] =
    useState<TrackingMethodBulkActionTarget>();
  const { clearSelection, selectedAccounts } = selection;
  useEffect(() => {
    setAssetClassTarget(undefined);
    setTrackingMethodTarget(undefined);
  }, [args.scopeKey, clearSelection]);
  return {
    assetClassTarget,
    trackingMethodTarget,
    openAssetClass: () => {
      if (selectedAccounts.length)
        setAssetClassTarget(createAccountBulkActionTarget(selectedAccounts));
    },
    openTrackingMethod: () => {
      const target = createTrackingMethodBulkActionTarget(selectedAccounts);
      if (target.accountIds.length) setTrackingMethodTarget(target);
    },
    close: () => {
      setAssetClassTarget(undefined);
      setTrackingMethodTarget(undefined);
    },
    onRefreshConstraints: args.onRefreshConstraints,
    applyTrackingMethod: async (value: AccountTrackingMethod) => {
      if (!trackingMethodTarget) return;
      await applyTrackingMethod(args, trackingMethodTarget, value, () => {
        setTrackingMethodTarget(undefined);
        clearSelection();
      });
    },
    applyAssetClass: async (value: string | null) => {
      if (!assetClassTarget) return;
      await applyAssetClass(args, assetClassTarget, value, () => {
        setAssetClassTarget(undefined);
        clearSelection();
      });
    },
  };
}
