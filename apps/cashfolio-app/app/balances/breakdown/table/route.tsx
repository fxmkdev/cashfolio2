import { formatMoney } from "~/formatting";
import { BalancesTableRows } from "./table-rows";
import { useRouteLoaderData } from "react-router";
import { type loader as breakdownLoader } from "../route";
import invariant from "tiny-invariant";
import { SimpleGrid, Stack, Table, VisuallyHidden } from "@mantine/core";

export default function Route() {
  const loaderData = useRouteLoaderData<typeof breakdownLoader>(
    "balances/breakdown/route",
  );
  invariant(loaderData, "Loader data is required");

  const { balanceSheet } = loaderData;

  return (
    <SimpleGrid>
      <Table layout="fixed" striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{balanceSheet.assets.name}</Table.Th>
            <Table.Th align="right">
              <VisuallyHidden>Balance in Original Currency</VisuallyHidden>
            </Table.Th>
            <Table.Th align="right">
              {formatMoney(balanceSheet.assets.balance)}
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <BalancesTableRows node={balanceSheet.assets} />
        </Table.Tbody>
      </Table>
      <Stack gap="md">
        <Table striped layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{balanceSheet.liabilities.name}</Table.Th>
              <Table.Th align="right">
                <VisuallyHidden>Balance in Original Currency</VisuallyHidden>
              </Table.Th>
              <Table.Th align="right">
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
              <Table.Th align="right">
                {formatMoney(balanceSheet.equity)}
              </Table.Th>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Stack>
    </SimpleGrid>
  );
}
