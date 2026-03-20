import { ActionIcon, Button, Group, Tabs } from "@mantine/core";
import { IconFilePlus, IconFolderPlus } from "@tabler/icons-react";
import { useState } from "react";
import { Outlet, useParams } from "react-router";
import { LinkTab } from "~/platform/link-tab";
import { EditAccountModal } from "./edit-account-modal";

export default function ListRoute() {
  const { type } = useParams<"type">();
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);
  return (
    <>
      <Group justify="stretch" mb="lg">
        <Tabs value={type} flex={1}>
          <Tabs.List>
            <LinkTab value="assets" to="assets">
              Assets
            </LinkTab>
            <LinkTab value="liabilities" to="liabilities">
              Liabilities
            </LinkTab>
            <LinkTab value="equities" to="equities">
              Equities
            </LinkTab>
          </Tabs.List>
        </Tabs>
        <Button.Group>
          <Button
            variant="default"
            leftSection={<IconFilePlus size={16} />}
            onClick={() => setIsNewAccountModalOpen(true)}
          >
            New Account
          </Button>
          <Button variant="default" leftSection={<IconFolderPlus size={16} />}>
            New Group
          </Button>
        </Button.Group>
      </Group>
      <EditAccountModal
        opened={isNewAccountModalOpen}
        onClose={() => setIsNewAccountModalOpen(false)}
        accountGroups={[
          { value: "group-1", label: "Group 1" },
          { value: "group-2", label: "Group 2" },
          { value: "group-3", label: "Group 3" },
        ]}
      />
      <Outlet />
    </>
  );
}
