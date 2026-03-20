import type { Serialize } from "~/serialization";
import { formatMoney } from "~/formatting";
import type { BalancesAccountsNode } from "../../types";
import { AccountsNodeChildrenTableRows } from "~/account-groups/table-rows";
import { Table } from "@mantine/core";

export function BalancesTableRows({
  node,
  negated,
}: {
  node: Serialize<BalancesAccountsNode>;
  negated?: boolean;
}) {
  return (
    <AccountsNodeChildrenTableRows node={node} viewPrefix="balances">
      {(node) => (
        <>
          <Table.Td align="right">
            {node.nodeType === "account" &&
              !!node.balanceInOriginalCurrency && (
                <>
                  {node.currency}{" "}
                  {formatMoney(
                    negated
                      ? -node.balanceInOriginalCurrency!
                      : node.balanceInOriginalCurrency!,
                  )}
                </>
              )}
          </Table.Td>
          <Table.Td align="right">
            {formatMoney(negated ? -node.balance : node.balance)}
          </Table.Td>
        </>
      )}
    </AccountsNodeChildrenTableRows>
  );
}
