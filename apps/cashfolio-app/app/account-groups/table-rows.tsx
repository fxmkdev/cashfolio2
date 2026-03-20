import type { Serialize } from "~/serialization";
import clsx from "clsx";
import type { AccountsNode } from "./accounts-tree";
import type { Account } from "~/.prisma-client/client";
import { useState, type ReactNode } from "react";
import { useAccountBook } from "~/account-books/hooks";
import { useFetcher, useNavigate, useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "~/root";
import { formatISODate } from "~/formatting";
import { Badge, Box, Group, Table, Text } from "@mantine/core";
import {
  IconChevronDown,
  IconChevronRight,
  IconWallet,
} from "@tabler/icons-react";

export type AccountsNodeTableRowOptions = {
  showInactiveBadge?: boolean;
  queryParams?: {
    from?: Date;
    to?: Date;
  };
};

export function AccountsNodeChildrenTableRows<TData = {}>({
  node,
  level = 0,
  children,
  viewPrefix,
  options = {},
}: {
  node: Serialize<AccountsNode<Account, TData>>;
  level?: number;
  negated?: boolean;
  children?: (node: Serialize<AccountsNode<Account, TData>>) => ReactNode;
  viewPrefix: string;
  options?: AccountsNodeTableRowOptions;
}) {
  if (node.nodeType === "account") {
    return null;
  }
  return node.children.map((child) => (
    <AccountsNodeTableRow
      key={child.id}
      node={child}
      level={level}
      children={children}
      viewPrefix={viewPrefix}
      options={options}
    />
  ));
}

export function AccountsNodeTableRow<TData = {}>({
  node,
  level,
  children,
  viewPrefix,
  options,
}: {
  node: Serialize<AccountsNode<Account, TData>>;
  level: number;
  children?: (node: Serialize<AccountsNode<Account, TData>>) => ReactNode;
  viewPrefix: string;
  options: AccountsNodeTableRowOptions;
}) {
  const accountBook = useAccountBook();

  const navigate = useNavigate();

  const fetcher = useFetcher();
  const expandedStateKey = `${viewPrefix}-account-group-${node.id}-expanded`;

  const rootLoaderData = useRouteLoaderData<typeof rootLoader>("root");

  const [isExpanded, setIsExpanded] = useState(
    rootLoaderData?.viewPreferences?.[expandedStateKey] === "true",
  );
  const optimisticIsExpanded =
    fetcher.state !== "idle" && fetcher.formData
      ? fetcher.formData.get("value") === "true"
      : isExpanded;

  const ExpandCollapseIcon = optimisticIsExpanded
    ? IconChevronDown
    : IconChevronRight;

  function toggleExpanded() {
    if (node.nodeType === "accountGroup" && node.children.length === 0) {
      return;
    }

    const nextIsExpanded = !optimisticIsExpanded;
    setIsExpanded(nextIsExpanded);

    const formData = new FormData();
    formData.append("key", expandedStateKey);
    formData.append("value", nextIsExpanded.toString());

    fetcher.submit(formData, {
      method: "POST",
      action: `/view-preferences/set`,
    });
  }

  const urlSearchParams = options.queryParams
    ? new URLSearchParams(
        Object.fromEntries(
          Object.entries(options.queryParams)
            .map(([key, value]) => [
              key,
              value
                ? value instanceof Date
                  ? formatISODate(value)
                  : String(value)
                : undefined,
            ])
            .filter(([, value]) => !!value),
        ),
      )
    : undefined;
  return (
    <>
      <Table.Tr
        {...(node.nodeType === "account"
          ? {
              onClick: () =>
                navigate(
                  `/${accountBook.id}/accounts/${node.id}${urlSearchParams ? `?${urlSearchParams.toString()}` : ""}`,
                ),
            }
          : { onClick: () => toggleExpanded() })}
      >
        <Table.Td>
          <Box pl={level * 16}>
            <Group gap="sm">
              {node.nodeType === "account" ? (
                <IconWallet size={16} />
              ) : (
                <ExpandCollapseIcon
                  size={16}
                  style={
                    node.children.length === 0 ? { visibility: "hidden" } : {}
                  }
                />
              )}
              <Text truncate="end" size="sm">
                {node.name}
              </Text>
              {options.showInactiveBadge && !node.isActive && (
                <Badge color="red" size="sm">
                  Inactive
                </Badge>
              )}
            </Group>
          </Box>
        </Table.Td>
        {children?.(node)}
      </Table.Tr>

      {optimisticIsExpanded && (
        <AccountsNodeChildrenTableRows
          node={node}
          level={level + 1}
          children={children}
          viewPrefix={viewPrefix}
          options={options}
        />
      )}
    </>
  );
}
