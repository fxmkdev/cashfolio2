import { Tooltip } from "@mantine/core";
import {
  IconArchive,
  IconArchiveOff,
  IconFileImport,
  IconPencil,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import {
  SplitButton,
  type SplitButtonMenuItem,
} from "@/components/controls/split-button";
import {
  getAccountConstraintMessage,
  getAccountEntityLabel,
  getAccountManagementContext,
  isCategoryAccount,
} from "@/shared/account-presentation";
import type { LedgerPageViewProps } from "./page-view.types";
import classes from "./page-header.module.css";

export type LedgerAccountActionsProps = Pick<
  LedgerPageViewProps,
  | "account"
  | "accountEditDisabledReason"
  | "statementImportDisabledReason"
  | "accountArchivable"
  | "accountArchiveLabel"
  | "accountUnarchivable"
  | "accountUnarchiveLabel"
  | "accountDeletable"
  | "accountDeleteLabel"
  | "onManageCategory"
  | "onOpenAccountEdit"
  | "onOpenImportPage"
  | "onOpenArchiveAccount"
  | "onUnarchiveAccount"
  | "onOpenDeleteAccount"
  | "unarchiveRecovery"
>;

function getSecondaryActions(
  props: LedgerAccountActionsProps,
  isImportPrimary: boolean,
): SplitButtonMenuItem[] {
  const context = getAccountManagementContext(props.account);
  const actions: SplitButtonMenuItem[] = [];
  if (isImportPrimary) {
    actions.push({
      key: "edit",
      label: "Edit",
      disabledReason: getAccountConstraintMessage(
        props.accountEditDisabledReason,
        context,
      ),
      disabled: !!props.accountEditDisabledReason,
      leftSection: <IconPencil size={16} />,
      onClick: props.onOpenAccountEdit,
    });
  }
  if (props.onManageCategory) {
    actions.push({
      key: "manage-category",
      label: "Manage Category",
      leftSection: <IconSettings size={16} />,
      onClick: props.onManageCategory,
    });
  }
  if (
    !isCategoryAccount(props.account) &&
    props.statementImportDisabledReason
  ) {
    actions.push({
      key: "import-statement",
      label: "Import Statement",
      disabledReason: props.statementImportDisabledReason,
      disabled: true,
      leftSection: <IconFileImport size={16} />,
      onClick: props.onOpenImportPage,
    });
  }
  return actions;
}

function getDangerActions(
  props: LedgerAccountActionsProps,
): SplitButtonMenuItem[] {
  const context = getAccountManagementContext(props.account);
  return [
    props.account.isActive
      ? {
          key: "archive",
          label: "Archive",
          disabledReason: getAccountConstraintMessage(
            props.accountArchiveLabel,
            context,
          ),
          disabled: !props.accountArchivable,
          color: "yellow",
          leftSection: <IconArchive size={16} />,
          onClick: props.onOpenArchiveAccount,
        }
      : {
          key: "unarchive",
          label: "Unarchive",
          disabledReason: getAccountConstraintMessage(
            props.accountUnarchiveLabel,
            context,
          ),
          disabled:
            !props.accountUnarchivable || props.unarchiveRecovery?.isPending,
          color: "blue",
          leftSection: <IconArchiveOff size={16} />,
          onClick: () => void props.onUnarchiveAccount(),
        },
    {
      key: "delete",
      label: "Delete",
      disabledReason: getAccountConstraintMessage(
        props.accountDeleteLabel,
        context,
      ),
      disabled: !props.accountDeletable,
      color: "red",
      leftSection: <IconTrash size={16} />,
      onClick: props.onOpenDeleteAccount,
    },
  ];
}

export function LedgerAccountActions(props: LedgerAccountActionsProps) {
  const entityLabel = getAccountEntityLabel(props.account);
  const context = getAccountManagementContext(props.account);
  const isImportPrimary =
    !isCategoryAccount(props.account) && !props.statementImportDisabledReason;
  const secondaryActions = getSecondaryActions(props, isImportPrimary);
  return (
    <Tooltip
      label={
        getAccountConstraintMessage(props.accountEditDisabledReason, context) ??
        `Edit ${entityLabel}`
      }
      disabled={isImportPrimary || !props.accountEditDisabledReason}
    >
      <span className={classes.action}>
        <SplitButton
          leftSection={
            isImportPrimary ? (
              <IconFileImport size={16} />
            ) : (
              <IconPencil size={16} />
            )
          }
          menuLabel={`${entityLabel} Actions`}
          onClick={
            isImportPrimary ? props.onOpenImportPage : props.onOpenAccountEdit
          }
          primaryDisabled={
            !isImportPrimary && !!props.accountEditDisabledReason
          }
          menuItems={[
            ...secondaryActions,
            ...(secondaryActions.length > 0
              ? [{ type: "divider" as const, key: "danger-actions-divider" }]
              : []),
            ...getDangerActions(props),
          ]}
        >
          {isImportPrimary ? "Import Statement" : "Edit"}
        </SplitButton>
      </span>
    </Tooltip>
  );
}
