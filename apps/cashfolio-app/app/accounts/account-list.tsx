import { AccountsTableRows } from "./account-table-rows";
import type { Serialize } from "~/serialization";
import type { AccountsNode } from "~/types";
import { useEditAccountGroup } from "~/account-groups/edit-account-group";
import { useDeleteAccountGroup } from "~/account-groups/delete-account-group";
import type { LoaderData } from "./list/route";
import { Table } from "@mantine/core";

export function AccountList({
  tree,
  onEditAccountGroup,
  onDeleteAccountGroup,
  viewPrefix,
}: {
  tree: LoaderData["tree"];
  onEditAccountGroup: ReturnType<
    typeof useEditAccountGroup
  >["onEditAccountGroup"];
  onDeleteAccountGroup: ReturnType<
    typeof useDeleteAccountGroup
  >["onDeleteAccountGroup"];
  viewPrefix: string;
}) {
  return (
    <>
      <Table
        striped
        verticalSpacing="sm"
        highlightOnHover
        className="mt-8 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]"
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Ccy./Symbol</Table.Th>
            <Table.Th className="w-10">
              <span className="sr-only">Actions</span>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <AccountsTableRows
            node={
              {
                id: "root",
                nodeType: "accountGroup",
                children: [tree.ASSET, tree.LIABILITY, tree.EQUITY].filter(
                  (n) => !!n,
                ),
              } as Serialize<AccountsNode>
            }
            onEditAccountGroup={onEditAccountGroup}
            onDeleteAccountGroup={onDeleteAccountGroup}
            viewPrefix={viewPrefix}
          />
        </Table.Tbody>
      </Table>
    </>
  );
}
