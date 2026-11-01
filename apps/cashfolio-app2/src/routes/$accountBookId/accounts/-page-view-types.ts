import { type ReportingGrouping } from "@/shared/reporting-grouping";
import type { BulkAccountActions } from "./-use-bulk-account-actions";
import { type AccountManagementContext } from "@/shared/account-presentation";
import type { AccountGainLossSummaries } from "@/shared/account-gain-loss";
import type { AgGridReactProps } from "ag-grid-react";
import type { AccountGroupInitialValues } from "@/components/account-editor/edit-account-group-modal";
import { type AccountGroupTransformedFormValues } from "@/components/account-editor/edit-account-group-modal";
import type { AccountInitialValues } from "@/components/account-editor/edit-account-modal";
import { type TransformedFormValues } from "@/components/account-editor/edit-account-modal";
import type { useUnarchiveMutation } from "@/hooks/use-unarchive-mutation";
import { type ReorderGroupChildRow } from "@/components/account-tree/reorder-group-children-modal";
import type {
  AccountsGridRow,
  AccountsMode,
  ReferenceCurrencyTotalFooterRow,
  TabValue,
  TreeRow,
} from "./-page-types";
import type { loadAccountsPageData } from "./-page-loader";
type AccountsPageLoaderData = Awaited<ReturnType<typeof loadAccountsPageData>>;
type RowTarget = {
  id: string;
  nodeType: "account" | "accountGroup";
  name: string;
};

export type AccountsPageViewProps = {
  bulkAccountActions?: BulkAccountActions;
  managementContext?: AccountManagementContext;
  grouping?: ReportingGrouping;
  onGroupingChange?: (grouping: ReportingGrouping) => void;
  gainLoss?: {
    data?: AccountGainLossSummaries;
    error?: string;
    loading: boolean;
    retry: () => void;
  };
  accountBookId: string;
  onRefreshConstraints?: () => Promise<void>;
  unarchiveRecovery?: ReturnType<typeof useUnarchiveMutation>;
  tab: TabValue;
  mode: AccountsMode;
  showArchived?: boolean;
  onShowArchivedChange?: (showArchived: boolean) => void;
  tabs: readonly { value: TabValue; label: string }[];
  archivedAccountGroups?: AccountsPageLoaderData["archivedAccountGroups"];
  archivedExistingNodes?: AccountsPageLoaderData["archivedExistingNodes"];
  accountGroups: AccountsPageLoaderData["accountGroups"];
  existingNodes: AccountsPageLoaderData["existingNodes"];
  unitUsage: AccountsPageLoaderData["unitUsage"];
  rows: TreeRow[];
  columnDefs: NonNullable<AgGridReactProps<AccountsGridRow>["columnDefs"]>;
  onGridReady?: AgGridReactProps<AccountsGridRow>["onGridReady"];
  pinnedBottomRowData?: ReferenceCurrencyTotalFooterRow[];
  isGroupOpenByDefault: AgGridReactProps<AccountsGridRow>["isGroupOpenByDefault"];
  onRowGroupOpened: AgGridReactProps<AccountsGridRow>["onRowGroupOpened"];
  createModalOpened: boolean;
  createAccountGroupId?: string;
  createGroupParentId?: string;
  editModalOpen: boolean;
  createGroupModalOpened: boolean;
  editGroupModalOpen: boolean;
  editingAccount?: { id: string; initialValues: AccountInitialValues };
  editingGroup?: { id: string; initialValues: AccountGroupInitialValues };
  deletingRow?: RowTarget;
  archivingRow?: RowTarget;
  reorderingRow?: { name: string; parentKey: string };
  selectedSiblingRows: ReorderGroupChildRow[];
  onOpenCreateGroup: () => void;
  onOpenCreateAccount: () => void;
  onOpenLedger: (accountId: string) => void;
  onCloseCreateAccount: () => void;
  onSubmitCreateAccount: (values: TransformedFormValues) => Promise<void>;
  onCloseEditAccount: () => void;
  onClearEditingAccount: () => void;
  onSubmitUpdateAccount: (values: TransformedFormValues) => Promise<void>;
  onCloseCreateGroup: () => void;
  onSubmitCreateGroup: (
    values: AccountGroupTransformedFormValues,
  ) => Promise<void>;
  onCloseEditGroup: () => void;
  onClearEditingGroup: () => void;
  onSubmitUpdateGroup: (
    values: AccountGroupTransformedFormValues,
  ) => Promise<void>;
  onCloseDelete: () => void;
  onConfirmDelete: () => Promise<void>;
  onCloseArchive: () => void;
  onConfirmArchive: () => Promise<void>;
  onCloseReorder: () => void;
  onReorderSiblings: (
    rows: { id: string; nodeType: "account" | "accountGroup" }[],
  ) => Promise<void>;
};
