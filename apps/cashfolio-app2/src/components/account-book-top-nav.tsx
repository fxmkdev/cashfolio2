import { Group, Tabs, Text } from "@mantine/core";

type AccountBookTopNavProps = {
  activeView: "dashboard" | "accounts";
  dashboardHref: string;
  accountsHref: string;
};

export function AccountBookTopNav({
  activeView,
  dashboardHref,
  accountsHref,
}: AccountBookTopNavProps) {
  return (
    <Group mb="lg" justify="space-between" align="center" gap="md">
      <Text size="xl" fw={700}>
        Cashfolio
      </Text>

      <Tabs value={activeView} variant="pills" aria-label="Primary navigation">
        <Tabs.List>
          <Tabs.Tab
            value="dashboard"
            renderRoot={(props) => <a {...props} href={dashboardHref} />}
          >
            Dashboard
          </Tabs.Tab>
          <Tabs.Tab
            value="accounts"
            renderRoot={(props) => <a {...props} href={accountsHref} />}
          >
            Accounts
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>
    </Group>
  );
}
