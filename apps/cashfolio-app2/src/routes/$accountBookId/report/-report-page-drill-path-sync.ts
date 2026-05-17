import { useEffect } from "react";
import type { BreakdownHierarchyNode } from "@/shared/breakdown-hierarchy";
import { clampBreakdownPath } from "./-breakdown/-breakdown-drill";
import type {
  DrillPathByAllocationBreakdown,
  DrillPathByAllocationBreakdownUpdater,
  DrillPathByBreakdown,
  DrillPathByBreakdownUpdater,
  DrillPathByGainsLossesUpdater,
} from "./-selector/-page-session-state";
import type { GainsLossesBreakdownNode } from "./-gains-losses/-gains-losses-breakdown-types";
import { clampGainsLossesPath } from "./-gains-losses/-gains-losses-drill";

type ReportDrillPathSyncInput = {
  drillPathByBreakdown: DrillPathByBreakdown;
  drillPathByAllocationBreakdown: DrillPathByAllocationBreakdown;
  drillPathByGainsLosses: string[];
  expenseBreakdownHierarchy: BreakdownHierarchyNode[];
  incomeBreakdownHierarchy: BreakdownHierarchyNode[];
  assetBreakdownHierarchy: BreakdownHierarchyNode[];
  liabilityBreakdownHierarchy: BreakdownHierarchyNode[];
  gainsLossesBreakdownHierarchy: GainsLossesBreakdownNode[];
};

export type ReportDrillPathSyncResult = {
  drillPathByBreakdown: DrillPathByBreakdown;
  drillPathByAllocationBreakdown: DrillPathByAllocationBreakdown;
  drillPathByGainsLosses: string[];
  hasBreakdownChanges: boolean;
  hasAllocationBreakdownChanges: boolean;
  hasGainsLossesChanges: boolean;
};

function arePathsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

export function getSyncedReportDrillPaths(
  args: ReportDrillPathSyncInput,
): ReportDrillPathSyncResult {
  const drillPathByBreakdown = {
    expense: clampBreakdownPath({
      hierarchy: args.expenseBreakdownHierarchy,
      path: args.drillPathByBreakdown.expense,
    }),
    income: clampBreakdownPath({
      hierarchy: args.incomeBreakdownHierarchy,
      path: args.drillPathByBreakdown.income,
    }),
  };
  const drillPathByAllocationBreakdown = {
    asset: clampBreakdownPath({
      hierarchy: args.assetBreakdownHierarchy,
      path: args.drillPathByAllocationBreakdown.asset,
    }),
    liability: clampBreakdownPath({
      hierarchy: args.liabilityBreakdownHierarchy,
      path: args.drillPathByAllocationBreakdown.liability,
    }),
  };
  const drillPathByGainsLosses = clampGainsLossesPath({
    hierarchy: args.gainsLossesBreakdownHierarchy,
    path: args.drillPathByGainsLosses,
  });

  return {
    drillPathByBreakdown,
    drillPathByAllocationBreakdown,
    drillPathByGainsLosses,
    hasBreakdownChanges:
      !arePathsEqual(
        drillPathByBreakdown.expense,
        args.drillPathByBreakdown.expense,
      ) ||
      !arePathsEqual(
        drillPathByBreakdown.income,
        args.drillPathByBreakdown.income,
      ),
    hasAllocationBreakdownChanges:
      !arePathsEqual(
        drillPathByAllocationBreakdown.asset,
        args.drillPathByAllocationBreakdown.asset,
      ) ||
      !arePathsEqual(
        drillPathByAllocationBreakdown.liability,
        args.drillPathByAllocationBreakdown.liability,
      ),
    hasGainsLossesChanges: !arePathsEqual(
      drillPathByGainsLosses,
      args.drillPathByGainsLosses,
    ),
  };
}

export function useSyncedReportDrillPaths(
  args: ReportDrillPathSyncInput & {
    setDrillPathByBreakdown: (nextValue: DrillPathByBreakdownUpdater) => void;
    setDrillPathByAllocationBreakdown: (
      nextValue: DrillPathByAllocationBreakdownUpdater,
    ) => void;
    setDrillPathByGainsLosses: (
      nextValue: DrillPathByGainsLossesUpdater,
    ) => void;
  },
) {
  const {
    drillPathByBreakdown,
    drillPathByAllocationBreakdown,
    drillPathByGainsLosses,
    expenseBreakdownHierarchy,
    incomeBreakdownHierarchy,
    assetBreakdownHierarchy,
    liabilityBreakdownHierarchy,
    gainsLossesBreakdownHierarchy,
    setDrillPathByBreakdown,
    setDrillPathByAllocationBreakdown,
    setDrillPathByGainsLosses,
  } = args;

  useEffect(() => {
    const syncedPaths = getSyncedReportDrillPaths({
      drillPathByBreakdown,
      drillPathByAllocationBreakdown,
      drillPathByGainsLosses,
      expenseBreakdownHierarchy,
      incomeBreakdownHierarchy,
      assetBreakdownHierarchy,
      liabilityBreakdownHierarchy,
      gainsLossesBreakdownHierarchy,
    });

    if (syncedPaths.hasBreakdownChanges) {
      setDrillPathByBreakdown(syncedPaths.drillPathByBreakdown);
    }
    if (syncedPaths.hasAllocationBreakdownChanges) {
      setDrillPathByAllocationBreakdown(
        syncedPaths.drillPathByAllocationBreakdown,
      );
    }
    if (syncedPaths.hasGainsLossesChanges) {
      setDrillPathByGainsLosses(syncedPaths.drillPathByGainsLosses);
    }
  }, [
    assetBreakdownHierarchy,
    drillPathByAllocationBreakdown,
    drillPathByBreakdown,
    drillPathByGainsLosses,
    expenseBreakdownHierarchy,
    gainsLossesBreakdownHierarchy,
    incomeBreakdownHierarchy,
    liabilityBreakdownHierarchy,
    setDrillPathByAllocationBreakdown,
    setDrillPathByBreakdown,
    setDrillPathByGainsLosses,
  ]);
}
