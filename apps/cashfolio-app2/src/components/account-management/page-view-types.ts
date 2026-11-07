import type { useDialogSubmitState } from "@/hooks/use-dialog-submit-state";
import type { OrganizeNode } from "@/shared/hierarchy-organize/types";
import { type ReportingGrouping } from "@/shared/reporting-grouping";
import type { OrganizerApi } from "@/components/hierarchy-organize/use-organizer";
import type { BulkAccountActions } from "./use-bulk-account-actions";
import { type AccountManagementContext } from "@/shared/account-presentation";
import type { AccountGainLossSummaries } from "@/shared/account-gain-loss";
import type { AgGridReactProps } from "ag-grid-react";
import type { AccountGroupInitialValues } from "@/components/account-editor/edit-account-group-modal";
import { type AccountGroupTransformedFormValues } from "@/components/account-editor/edit-account-group-modal";
import type { AccountInitialValues } from "@/components/account-editor/edit-account-modal";
import { type TransformedFormValues } from "@/components/account-editor/edit-account-modal";
import type { useUnarchiveMutation } from "@/hooks/use-unarchive-mutation";
import type {
  AccountsGridRow,
  ReferenceCurrencyTotalFooterRow,
  AccountGridTreeRow,
} from "./page-types";
import type { AccountsMode, TabValue } from "@/shared/account-tabs";
import type { loadAccountsPageData } from "./page-loader";
type AccountsPageLoaderData = Awaited<ReturnType<typeof loadAccountsPageData>>;
type RowTarget = {
  id: string;
  nodeType: "account" | "accountGroup";
  name: string;
};

export type AccountsPageViewProps = {
  editorSubmitState?: ReturnType<typeof useDialogSubmitState>;
  onEditHierarchyNode?: (node: OrganizeNode) => void;
  onAddHierarchyChild?: (
    node: OrganizeNode,
    kind: "account" | "accountGroup",
  ) => void;
  organizerApi?: OrganizerApi;
  organize?: boolean;
  onOrganizeSaved?: () => void;
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
  rows: AccountGridTreeRow[];
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
};
