import { useRef, useState } from "react";
import type { AccountTrackingMethod } from "@/.prisma-client/enums";
import { ACCOUNT_BOOK_BUSY_MESSAGE } from "@/shared/mutation-errors";

export function useStoryAssignments(assignmentFailsOnce = false) {
  const [scope, setScope] = useState("first");
  const [assetClasses, setAssetClasses] = useState<
    Record<string, string | null>
  >({});
  const [trackingMethods, setTrackingMethods] = useState<
    Record<string, AccountTrackingMethod>
  >({});
  const [submittedAccountIds, setSubmittedAccountIds] = useState<string[]>([]);
  const [refreshCount, setRefreshCount] = useState(0);
  const [invalidationCount, setInvalidationCount] = useState(0);
  const hasFailed = useRef(false);
  const submit = (accountIds: string[]) => {
    if (assignmentFailsOnce && !hasFailed.current) {
      hasFailed.current = true;
      throw new Error(ACCOUNT_BOOK_BUSY_MESSAGE);
    }
    setSubmittedAccountIds(accountIds);
  };
  return {
    scope,
    setScope,
    assetClasses,
    trackingMethods,
    submittedAccountIds,
    refreshCount,
    invalidationCount,
    mutations: {
      submitAssetClass: async (
        accountIds: string[],
        assetClassId: string | null,
      ) => {
        submit(accountIds);
        setAssetClasses((current) => ({
          ...current,
          ...Object.fromEntries(accountIds.map((id) => [id, assetClassId])),
        }));
      },
      submitTrackingMethod: async (
        accountIds: string[],
        trackingMethod: AccountTrackingMethod,
      ) => {
        submit(accountIds);
        setTrackingMethods((current) => ({
          ...current,
          ...Object.fromEntries(accountIds.map((id) => [id, trackingMethod])),
        }));
      },
      invalidate: () => setInvalidationCount((count) => count + 1),
      onRefreshConstraints: async () => {
        setRefreshCount((count) => count + 1);
      },
    },
  };
}
