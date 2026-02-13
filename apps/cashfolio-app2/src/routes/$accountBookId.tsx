import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { IconPencil, IconPlus } from "@tabler/icons-react";
import { EditAccountModal } from "../components/edit-account-modal";
import type {
  AccountInitialValues,
  TransformedFormValues,
} from "../components/edit-account-modal";
import {
  createAccount,
  getAccountGroups,
  getAccounts,
  updateAccount,
} from "../server/accounts";
import {
  AccountType,
  EquityAccountSubtype,
} from "../.prisma-client/enums";

const tabs = [
  { value: "ASSET", label: "Asset" },
  { value: "LIABILITY", label: "Liability" },
  { value: `EQUITY-${EquityAccountSubtype.INCOME}`, label: "Income" },
  { value: `EQUITY-${EquityAccountSubtype.EXPENSE}`, label: "Expense" },
  { value: `EQUITY-${EquityAccountSubtype.GAIN_LOSS}`, label: "Gain/Loss" },
] as const;

type TabValue = (typeof tabs)[number]["value"];

function matchesTab(
  account: { type: string; equityAccountSubtype: string | null },
  tab: TabValue,
): boolean {
  if (tab === "ASSET" || tab === "LIABILITY") {
    return account.type === tab;
  }
  const [, subtype] = tab.split("-");
  return account.type === AccountType.EQUITY && account.equityAccountSubtype === subtype;
}

export const Route = createFileRoute("/$accountBookId")({
  validateSearch: (search: Record<string, unknown>): { tab: TabValue } => ({
    tab: tabs.some((t) => t.value === search.tab)
      ? (search.tab as TabValue)
      : "ASSET",
  }),
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
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/$accountBookId" });
  const router = useRouter();
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [editingAccount, setEditingAccount] = useState<
    { id: string; initialValues: AccountInitialValues } | undefined
  >();
  const [editModalOpen, setEditModalOpen] = useState(false);

  const filteredAccounts = accounts.filter((a) => matchesTab(a, tab));
  const isEquityTab = tab.startsWith("EQUITY-");

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
    setCreateModalOpened(false);
    router.invalidate();
  }

  async function handleUpdateAccount(values: TransformedFormValues) {
    if (!editingAccount) return;
    await updateAccount({
      data: {
        id: editingAccount.id,
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
    setEditModalOpen(false);
    router.invalidate();
  }

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="lg">
        <Title order={2}>Accounts</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => setCreateModalOpened(true)}
        >
          Add Account
        </Button>
      </Group>

      <Tabs
        value={tab}
        onChange={(value) =>
          navigate({ search: { tab: value as TabValue } })
        }
      >
        <Tabs.List mb="md">
          {tabs.map((t) => (
            <Tabs.Tab key={t.value} value={t.value}>
              {t.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Account</Table.Th>
              {!isEquityTab && <Table.Th>Unit</Table.Th>}
              {!isEquityTab && <Table.Th>Currency / Symbol</Table.Th>}
              <Table.Th>Active</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filteredAccounts.map((account) => (
              <Table.Tr key={`${account.id}-${account.accountBookId}`}>
                <Table.Td>
                  {account.groupPath} / {account.name}
                </Table.Td>
                {!isEquityTab && (
                  <Table.Td>{account.unit ?? "—"}</Table.Td>
                )}
                {!isEquityTab && (
                  <Table.Td>
                    {account.currency ??
                      account.cryptocurrency ??
                      account.symbol ??
                      "—"}
                  </Table.Td>
                )}
                <Table.Td>
                  <Badge color={account.isActive ? "green" : "gray"}>
                    {account.isActive ? "Active" : "Inactive"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <ActionIcon
                    variant="subtle"
                    onClick={() => {
                      setEditingAccount({
                        id: account.id,
                        initialValues: {
                          name: account.name,
                          type: account.type,
                          equityAccountSubtype: account.equityAccountSubtype,
                          groupId: account.groupId,
                          unit: account.unit,
                          currency: account.currency,
                          cryptocurrency: account.cryptocurrency,
                          symbol: account.symbol,
                          tradeCurrency: account.tradeCurrency,
                        },
                      });
                      setEditModalOpen(true);
                    }}
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
            {filteredAccounts.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={isEquityTab ? 3 : 5}>
                  <Text c="dimmed" ta="center" py="md">
                    No accounts yet. Click &quot;Add Account&quot; to create
                    one.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Tabs>

      <EditAccountModal
        opened={createModalOpened}
        onClose={() => setCreateModalOpened(false)}
        accountGroups={accountGroups}
        onSubmit={handleCreateAccount}
      />

      <EditAccountModal
        opened={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onExitTransitionEnd={() => setEditingAccount(undefined)}
        accountGroups={accountGroups}
        onSubmit={handleUpdateAccount}
        initialValues={editingAccount?.initialValues}
      />
    </Container>
  );
}
