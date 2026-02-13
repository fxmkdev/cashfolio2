import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  Badge,
  Button,
  Container,
  Group,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { EditAccountModal } from "../components/edit-account-modal";
import type { TransformedFormValues } from "../components/edit-account-modal";
import {
  createAccount,
  getAccountGroups,
  getAccounts,
} from "../server/accounts";

export const Route = createFileRoute("/$accountBookId")({
  loader: async ({ params: { accountBookId } }) => {
    const [accounts, accountGroups] = await Promise.all([
      getAccounts({ data: { accountBookId } }),
      getAccountGroups({ data: { accountBookId } }),
    ]);
    return { accounts, accountGroups };
  },
  component: AccountsPage,
});

function AccountsPage() {
  const { accounts, accountGroups } = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const router = useRouter();
  const [modalOpened, setModalOpened] = useState(false);

  async function handleCreateAccount(values: TransformedFormValues) {
    await createAccount({
      data: {
        accountBookId,
        name: values.name!,
        type: values.type,
        equityAccountSubtype: values.equityAccountSubtype,
        groupId: values.groupId!,
        unit: values.unit,
        currency: values.currency,
        cryptocurrency: values.cryptocurrency,
        symbol: values.symbol,
        tradeCurrency: values.tradeCurrency,
      },
    });
    setModalOpened(false);
    router.invalidate();
  }

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Accounts</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setModalOpened(true)}
        >
          Add Account
        </Button>
      </Group>

      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Account</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Unit</Table.Th>
            <Table.Th>Currency / Symbol</Table.Th>
            <Table.Th>Active</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {accounts.map((account) => (
            <Table.Tr key={`${account.id}-${account.accountBookId}`}>
              <Table.Td>
                {account.groupPath} / {account.name}
              </Table.Td>
              <Table.Td>
                <Badge variant="light">
                  {account.type}
                  {account.equityAccountSubtype
                    ? ` - ${account.equityAccountSubtype}`
                    : ""}
                </Badge>
              </Table.Td>
              <Table.Td>{account.unit ?? "—"}</Table.Td>
              <Table.Td>
                {account.currency ??
                  account.cryptocurrency ??
                  account.symbol ??
                  "—"}
              </Table.Td>
              <Table.Td>
                <Badge color={account.isActive ? "green" : "gray"}>
                  {account.isActive ? "Active" : "Inactive"}
                </Badge>
              </Table.Td>
            </Table.Tr>
          ))}
          {accounts.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text c="dimmed" ta="center" py="md">
                  No accounts yet. Click &quot;Add Account&quot; to create one.
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <EditAccountModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        accountGroups={accountGroups}
        onSubmit={handleCreateAccount}
      />
    </Container>
  );
}
