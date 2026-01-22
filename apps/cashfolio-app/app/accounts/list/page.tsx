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
import { PlusCircleIcon } from "~/platform/icons/standard";
import { AccountList } from "../account-list";
import { ShowInactiveSwitch } from "./show-inactive-switch";
import { Button, Flex, Title } from "@mantine/core";

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
      <Flex gap="sm" align="center" justify="space-between">
        <Title order={2} size="h3">
          Accounts
        </Title>
        <Flex gap="xl" align="center">
          <ShowInactiveSwitch />
          <Flex gap="sm" align="center">
            <Button
              variant="outline"
              leftSection={<PlusCircleIcon className="size-4" />}
              onClick={() => onNewAccount()}
            >
              New Account
            </Button>
            <Button
              variant="outline"
              leftSection={<PlusCircleIcon className="size-4" />}
              onClick={() => onNewAccountGroup()}
            >
              New Group
            </Button>
          </Flex>
        </Flex>
      </Flex>
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
