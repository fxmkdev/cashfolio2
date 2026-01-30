import { formatMoney } from "~/formatting";
import { BalancesTableRows } from "./table-rows";
import { useRouteLoaderData } from "react-router";
import { type loader as breakdownLoader } from "../route";
import invariant from "tiny-invariant";
import { Table } from "@mantine/core";

export default function Route() {
  const loaderData = useRouteLoaderData<typeof breakdownLoader>(
    "balances/breakdown/route",
  );
  invariant(loaderData, "Loader data is required");

  const { balanceSheet } = loaderData;

  return (
    <div className="xl:grid grid-cols-2 gap-12 mt-8">
      <Table layout="fixed" striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{balanceSheet.assets.name}</Table.Th>
            <Table.Th className="text-right w-32">
              <span className="sr-only">Balance in Original Currency</span>
            </Table.Th>
            <Table.Th className="text-right w-32">
              {formatMoney(balanceSheet.assets.balance)}
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <BalancesTableRows node={balanceSheet.assets} />
        </Table.Tbody>
      </Table>
      <div className="space-y-12">
        <Table striped layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{balanceSheet.liabilities.name}</Table.Th>
              <Table.Th className="text-right w-32">
                <span className="sr-only">Balance in Original Currency</span>
              </Table.Th>
              <Table.Th className="text-right w-32">
                {formatMoney(-balanceSheet.liabilities.balance)}
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <BalancesTableRows node={balanceSheet.liabilities} negated={true} />
          </Table.Tbody>
        </Table>
        <Table striped layout="fixed">
          <Table.Tbody>
            <Table.Tr>
              <Table.Th>Net Worth</Table.Th>
              <Table.Th className="text-right">
                {formatMoney(balanceSheet.equity)}
              </Table.Th>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </div>
    </div>
  );
}
