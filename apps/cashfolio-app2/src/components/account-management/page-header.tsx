import { reportingGroupingOptions } from "@/shared/reporting-grouping";
import { getAccountManagementPath } from "@/shared/account-presentation";
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Select,
  Tabs,
  Text,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { IconArrowsMove, IconPlus } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { LinkTab } from "@/components/navigation/link-tab";
import { TopPageHeader } from "@/components/layout/top-page-header";
import { getAccountsPageTitle } from "./page-types";
import type { AccountsPageViewProps } from "./page-view-types";
import type { ReactNode } from "react";

type HeaderProps = Pick<
  AccountsPageViewProps,
  | "managementContext"
  | "grouping"
  | "onGroupingChange"
  | "accountBookId"
  | "tab"
  | "showArchived"
  | "onShowArchivedChange"
  | "tabs"
  | "onOpenCreateGroup"
  | "onOpenCreateAccount"
> & {
  organizing?: boolean;
  onOrganize?: () => void;
  organizePending?: boolean;
  organizerActions?: ReactNode;
  managementPending?: boolean;
};
type HeaderOptions = HeaderProps & {
  managementContext: NonNullable<HeaderProps["managementContext"]>;
  grouping: NonNullable<HeaderProps["grouping"]>;
  showArchived: boolean;
  organizing: boolean;
  managementPending: boolean;
};
type HeaderLayoutProps = HeaderOptions & {
  managementTabs: ReactNode;
  managementActions: ReactNode;
};
type ManagementActionProps = Pick<
  HeaderOptions,
  | "managementContext"
  | "grouping"
  | "onOrganize"
  | "organizePending"
  | "accountBookId"
  | "onOpenCreateGroup"
  | "managementPending"
  | "onOpenCreateAccount"
  | "tab"
>;
type CategoriesHeaderProps = Pick<
  HeaderLayoutProps,
  | "managementContext"
  | "managementTabs"
  | "managementActions"
  | "managementPending"
  | "showArchived"
  | "onShowArchivedChange"
>;
type AccountsHeaderProps = Pick<
  HeaderLayoutProps,
  | "organizing"
  | "grouping"
  | "onGroupingChange"
  | "organizerActions"
  | "managementActions"
>;

function ManagementTabs({
  managementContext,
  accountBookId,
  tab,
  showArchived,
  tabs,
}: Pick<
  HeaderOptions,
  "managementContext" | "accountBookId" | "tab" | "showArchived" | "tabs"
>) {
  const isCategories = managementContext === "categories";
  const managementPath = getAccountManagementPath(managementContext);
  return (
    <Tabs value={tab} variant={isCategories ? "pills" : "default"}>
      <Tabs.List
        aria-label={isCategories ? "Category Type" : undefined}
        mb={isCategories ? undefined : "md"}
      >
        {tabs.map((t) => (
          <LinkTab
            key={t.value}
            value={t.value}
            to={managementPath}
            params={{ accountBookId }}
            search={
              isCategories
                ? { tab: t.value, showArchived }
                : { tab: t.value, mode: "active" }
            }
          >
            {t.label}
          </LinkTab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
function ManagementActions(props: ManagementActionProps) {
  const isCategories = props.managementContext === "categories";
  return (
    <Group gap={isCategories ? "sm" : "md"}>
      {!isCategories &&
        props.grouping === "accountStructure" &&
        props.onOrganize && (
          <Button
            variant="default"
            leftSection={<IconArrowsMove size={16} />}
            onClick={props.onOrganize}
            disabled={props.organizePending}
          >
            Organize
          </Button>
        )}
      <GroupCreationAction {...props} />
      <Button
        leftSection={<IconPlus size={16} />}
        onClick={props.onOpenCreateAccount}
        disabled={props.managementPending}
      >
        {isCategories
          ? props.tab === "EQUITY-INCOME"
            ? "Add Income Category"
            : "Add Expense Category"
          : "Add Account"}
      </Button>
    </Group>
  );
}
function GroupCreationAction(
  props: Pick<
    HeaderOptions,
    | "managementContext"
    | "grouping"
    | "accountBookId"
    | "onOpenCreateGroup"
    | "managementPending"
  >,
) {
  return props.managementContext !== "categories" &&
    props.grouping === "assetClass" ? (
    <Button
      renderRoot={(linkProps) => (
        <Link
          {...linkProps}
          to="/$accountBookId/settings/classifications"
          params={{ accountBookId: props.accountBookId }}
        />
      )}
      variant="default"
    >
      Manage Asset Classes
    </Button>
  ) : (
    <Button
      variant="default"
      leftSection={<IconPlus size={16} />}
      onClick={props.onOpenCreateGroup}
      disabled={props.managementPending}
    >
      Add Group
    </Button>
  );
}
function CategoriesHeader({
  managementContext,
  managementTabs,
  managementActions,
  managementPending,
  showArchived,
  onShowArchivedChange,
}: CategoriesHeaderProps) {
  return (
    <>
      <VisuallyHidden component="div">
        <Title order={2}>
          {getAccountsPageTitle(undefined, managementContext)}
        </Title>
      </VisuallyHidden>
      <Group justify="space-between" align="center" gap="md" mb="md">
        <Group gap="md">
          {managementTabs}
          <Checkbox
            label="Show Archived"
            disabled={managementPending}
            checked={showArchived}
            onChange={(event) =>
              onShowArchivedChange?.(event.currentTarget.checked)
            }
          />
        </Group>
        {managementActions}
      </Group>
    </>
  );
}
function AccountsHeader({
  organizing,
  grouping,
  onGroupingChange,
  organizerActions,
  managementActions,
}: AccountsHeaderProps) {
  return (
    <TopPageHeader
      heading={<Title order={2}>{getAccountsPageTitle()}</Title>}
      headingAccessory={
        organizing ? (
          <Badge variant="light" size="lg">
            Organizing
          </Badge>
        ) : (
          <Group gap="xs" wrap="nowrap">
            <Text size="sm">Group By</Text>
            <Select
              aria-label="Group By"
              w={180}
              data={reportingGroupingOptions}
              value={grouping}
              allowDeselect={false}
              onChange={(value) => {
                if (value === "accountStructure" || value === "assetClass")
                  onGroupingChange?.(value);
              }}
            />
          </Group>
        )
      }
      actions={organizing ? organizerActions : managementActions}
    />
  );
}
export function AccountsPageHeader(props: HeaderProps) {
  const options: HeaderOptions = {
    ...props,
    managementContext: props.managementContext ?? "accounts",
    grouping: props.grouping ?? "accountStructure",
    showArchived: props.showArchived ?? false,
    organizing: props.organizing ?? false,
    managementPending: props.managementPending ?? false,
  };
  const layout = {
    ...options,
    managementTabs: <ManagementTabs {...options} />,
    managementActions: <ManagementActions {...options} />,
  };
  return options.managementContext === "categories" ? (
    <CategoriesHeader {...layout} />
  ) : (
    <AccountsHeader {...layout} />
  );
}
