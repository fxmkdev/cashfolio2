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
import { getAccountsPageTitle } from "./-page-types";
import type { AccountsPageViewProps } from "./-page-view-types";
import type { ReactNode } from "react";
export function AccountsPageHeader({
  managementContext = "accounts",
  grouping = "accountStructure",
  onGroupingChange,
  accountBookId,
  tab,
  showArchived = false,
  onShowArchivedChange,
  tabs,
  onOpenCreateGroup,
  onOpenCreateAccount,
  organizing = false,
  onOrganize,
  organizePending,
  organizerActions,
}: Pick<
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
}) {
  const isCategories = managementContext === "categories";
  const managementPath = getAccountManagementPath(managementContext);
  const managementTabs = (
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
  const managementActions = (
    <Group gap={isCategories ? "sm" : "md"}>
      {!isCategories && grouping === "accountStructure" && onOrganize && (
        <Button
          variant="default"
          leftSection={<IconArrowsMove size={16} />}
          onClick={onOrganize}
          disabled={organizePending}
        >
          Organize
        </Button>
      )}
      {!isCategories && grouping === "assetClass" ? (
        <Button
          renderRoot={(props) => (
            <Link
              {...props}
              to="/$accountBookId/settings/classifications"
              params={{ accountBookId }}
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
          onClick={onOpenCreateGroup}
        >
          Add Group
        </Button>
      )}
      <Button
        leftSection={<IconPlus size={16} />}
        onClick={onOpenCreateAccount}
      >
        {isCategories
          ? tab === "EQUITY-INCOME"
            ? "Add Income Category"
            : "Add Expense Category"
          : "Add Account"}
      </Button>
    </Group>
  );

  return (
    <>
      {isCategories ? (
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
                checked={showArchived}
                onChange={(event) =>
                  onShowArchivedChange?.(event.currentTarget.checked)
                }
              />
            </Group>
            {managementActions}
          </Group>
        </>
      ) : (
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
      )}
    </>
  );
}
