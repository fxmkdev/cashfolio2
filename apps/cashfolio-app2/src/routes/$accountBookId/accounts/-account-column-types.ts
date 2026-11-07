import type { ReportingGrouping } from "@/shared/reporting-grouping";
import type { AccountGainLossSummaries } from "@/shared/account-gain-loss";
import type { GroupBalanceAggregation } from "./-page-data";
import {
  type RowTarget,
  type TreeRow,
  type PersistedTreeRow,
  type PersistedGroupRow,
} from "./-page-types";
export type AccountTreeColumnParams = {
  grouping?: ReportingGrouping;
  gainLossData?: AccountGainLossSummaries;
  isGainLossLoading?: boolean;
  isEquityTab: boolean;
  categoryType?: "INCOME" | "EXPENSE";
  rowsByParentKey: Map<string, TreeRow[]>;
  referenceCurrency: string;
  isReferenceBalancesLoading: boolean;
  balanceInReferenceCurrencyByGroupId: Map<string, GroupBalanceAggregation>;
  onEditRow: (row: PersistedTreeRow) => void;
  onAddChild?: (
    row: PersistedGroupRow,
    kind: "account" | "accountGroup",
  ) => void;
  onUnarchiveRow: (row: PersistedTreeRow) => Promise<void>;
  unarchivePending?: boolean;
  onArchiveRow: (row: RowTarget) => void;
  onDeleteRow: (row: RowTarget) => void;
  onReorderRow: (value: { name: string; parentKey: string }) => void;
};
