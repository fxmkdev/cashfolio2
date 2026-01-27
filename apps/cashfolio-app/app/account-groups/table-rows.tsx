import type { Serialize } from "~/serialization";
import clsx from "clsx";
import type { AccountsNode } from "./accounts-tree";
import type { Account } from "~/.prisma-client/client";
import { useState, type ReactNode } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  WalletIcon,
} from "~/platform/icons/standard";
import { useAccountBook } from "~/account-books/hooks";
import { useFetcher, useNavigate, useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "~/root";
import { formatISODate } from "~/formatting";
import { Badge, Table } from "@mantine/core";

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
    ? ChevronDownIcon
    : ChevronRightIcon;

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
          <div
            className={clsx({
              "pl-0": level === 0,
              "pl-4": level === 1,
              "pl-8": level === 2,
              "pl-12": level === 3,
              "pl-16": level === 4,
              "pl-20": level === 5,
              "pl-24": level === 6,
              "pl-28": level === 7,
              "pl-32": level === 8,
              "pl-36": level === 9,
              "pl-40": level === 10,
            })}
          >
            <div className="flex gap-2 items-center">
              {node.nodeType === "account" ? (
                <WalletIcon className="size-4 shrink-0" />
              ) : (
                <ExpandCollapseIcon
                  className={clsx(
                    "size-4 shrink-0",
                    node.children.length === 0 && "invisible",
                  )}
                />
              )}
              <span className="truncate">{node.name}</span>
              {options.showInactiveBadge && !node.isActive && (
                <Badge color="red" size="sm">
                  Inactive
                </Badge>
              )}
            </div>
          </div>
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
