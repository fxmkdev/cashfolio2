import type { AccountTrackingMethod } from "@/.prisma-client/enums";
import type { AccountGridTreeRow } from "../grid/rows";
export type BulkAccountActionOptions = {
  scopeKey: string;
  enabled: boolean;
  rows: AccountGridTreeRow[];
  submitAssetClass: (
    accountIds: string[],
    assetClassId: string | null,
  ) => Promise<unknown>;
  submitTrackingMethod: (
    accountIds: string[],
    trackingMethod: AccountTrackingMethod,
  ) => Promise<unknown>;
  invalidate: () => void;
  onRefreshConstraints?: () => Promise<void>;
};
