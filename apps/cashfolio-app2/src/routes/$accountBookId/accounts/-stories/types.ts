import type { ReportingGrouping } from "@/shared/reporting-grouping";
import type { AccountsMode, TabValue, TreeRow } from "../-page-types";
export type AccountsStoryOptions = {
  bulkAssignment?: boolean;
  assignmentFailsOnce?: boolean;
  rowsOverride?: TreeRow[];
  expandGroups?: boolean;
  gainLossState?: "ready" | "loading" | "error" | "partial";
  toggleGainLossLoading?: boolean;
  initialMode: AccountsMode;
  initialTab?: TabValue;
  startWithCreateModal?: boolean;
  startWithEditModal?: boolean;
  routeSmoke?: boolean;
  initialGrouping?: ReportingGrouping;
  rememberExpansion?: boolean;
};
