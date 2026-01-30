import { EditAccount, useEditAccount } from "~/accounts/edit-account";
import type { LoaderData } from "./route";
import {
  EditAccountGroup,
  useEditAccountGroup,
} from "~/account-groups/edit-account-group";
import {
  DeleteAccountGroup,
  useDeleteAccountGroup,
} from "~/account-groups/delete-account-group";
import { DeleteAccount, useDeleteAccount } from "~/accounts/delete-account";
import { AccountList } from "../account-list";
import { ShowInactiveSwitch } from "./show-inactive-switch";
import { Button, Group, Title } from "@mantine/core";
import { IconCirclePlus } from "@tabler/icons-react";

export function Page({
  loaderData: { tree, accountGroups },
}: {
  loaderData: LoaderData;
}) {
  const { editAccountProps, onNewAccount } = useEditAccount();
  const { editAccountGroupProps, onNewAccountGroup, onEditAccountGroup } =
    useEditAccountGroup();

  const { deleteAccountGroupProps, onDeleteAccountGroup } =
    useDeleteAccountGroup();

  const { deleteAccountProps } = useDeleteAccount();

  return (
    <div>
      <Group gap="sm" align="center" justify="space-between">
        <Title order={2} size="h3">
          Accounts
        </Title>
        <Group gap="xl" align="center">
          <ShowInactiveSwitch />
          <Group gap="sm" align="center">
            <Button
              variant="default"
              leftSection={<IconCirclePlus size={16} />}
              onClick={() => onNewAccount()}
            >
              New Account
            </Button>
            <Button
              variant="default"
              leftSection={<IconCirclePlus size={16} />}
              onClick={() => onNewAccountGroup()}
            >
              New Group
            </Button>
          </Group>
        </Group>
      </Group>
      <EditAccount {...editAccountProps} accountGroups={accountGroups} />
      <EditAccountGroup
        {...editAccountGroupProps}
        accountGroups={accountGroups}
      />
      <DeleteAccount {...deleteAccountProps} />
      <DeleteAccountGroup {...deleteAccountGroupProps} />
      <AccountList
        tree={tree}
        onEditAccountGroup={onEditAccountGroup}
        onDeleteAccountGroup={onDeleteAccountGroup}
        viewPrefix="accounts-list"
      />
    </div>
  );
}
