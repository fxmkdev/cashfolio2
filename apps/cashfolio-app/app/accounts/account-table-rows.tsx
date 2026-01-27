import { PencilSquareIcon, TrashIcon } from "~/platform/icons/standard";
import type { AccountGroup } from "~/.prisma-client/client";
import type { AccountsNode } from "~/account-groups/accounts-tree";
import { AccountsNodeChildrenTableRows } from "~/account-groups/table-rows";
import type { Serialize } from "~/serialization";
import { Unit } from "~/.prisma-client/enums";
import { ActionIcon, Badge, Group, Table } from "@mantine/core";

export function AccountsTableRows({
  node,
  onEditAccountGroup,
  onDeleteAccountGroup,
  viewPrefix,
}: {
  node: Serialize<AccountsNode>;
  onEditAccountGroup: (accountGroup: Serialize<AccountGroup>) => void;
  onDeleteAccountGroup: (accountGroupId: string) => void;
  viewPrefix: string;
}) {
  return (
    <AccountsNodeChildrenTableRows
      node={node}
      viewPrefix={viewPrefix}
      options={{ showInactiveBadge: true }}
    >
      {(node) => (
        <>
          <Table.Td className="w-40 space-x-2">
            {node.nodeType === "account" &&
              (node.unit === Unit.CURRENCY ? (
                <Badge size="sm">{node.currency}</Badge>
              ) : node.unit === Unit.CRYPTOCURRENCY ? (
                <Badge size="sm">{node.cryptocurrency}</Badge>
              ) : node.unit === Unit.SECURITY ? (
                <>
                  <Badge size="sm">{node.symbol}</Badge>
                  <Badge size="sm">{node.tradeCurrency}</Badge>
                </>
              ) : null)}
          </Table.Td>
          <Table.Td>
            {node.nodeType === "accountGroup" && (
              <Group wrap="nowrap">
                <ActionIcon
                  size="sm"
                  variant="default"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditAccountGroup(node);
                  }}
                >
                  <PencilSquareIcon className="size-4" />
                </ActionIcon>
                <ActionIcon
                  variant="default"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteAccountGroup(node.id);
                  }}
                >
                  <TrashIcon className="size-4" />
                </ActionIcon>
              </Group>
            )}
          </Table.Td>
        </>
      )}
    </AccountsNodeChildrenTableRows>
  );
}
