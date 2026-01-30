import type { Serialize } from "~/serialization";
import { formatMoney } from "~/formatting";
import {
  AccountsNodeChildrenTableRows,
  type AccountsNodeTableRowOptions,
} from "~/account-groups/table-rows";
import type { AccountsNode } from "~/account-groups/accounts-tree";
import { Table } from "@mantine/core";

export function IncomeTableRows({
  node,
  incomeByNodeId,
  options,
}: {
  node: Serialize<AccountsNode>;
  incomeByNodeId: Record<string, number>;
  options?: AccountsNodeTableRowOptions;
}) {
  return (
    <AccountsNodeChildrenTableRows
      node={node}
      viewPrefix="income"
      options={options}
    >
      {(node) => (
        <>
          <Table.Td align="right">
            {formatMoney(incomeByNodeId[node.id] ?? 0)}
          </Table.Td>
        </>
      )}
    </AccountsNodeChildrenTableRows>
  );
}
