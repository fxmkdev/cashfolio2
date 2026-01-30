import { useState } from "react";
import type { Serialize } from "~/serialization";
import type { AccountGroupOption } from "~/types";
import {
  CancelButton,
  CreateOrSaveButton,
  FormDialog,
} from "~/platform/forms/form-dialog";
import { useAccountBook } from "~/account-books/hooks";
import {
  Grid,
  Group,
  Input,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import type { AccountGroup } from "~/.prisma-client/client";
import { AccountType } from "~/.prisma-client/enums";
import { FormattedNumberInput } from "~/platform/forms/formatted-number-input";

export function useEditAccountGroup() {
  const [isOpen, setIsOpen] = useState(false);
  const [accountGroup, setAccountGroup] = useState<Serialize<AccountGroup>>();
  return {
    editAccountGroupProps: {
      isOpen,
      onClose: () => setIsOpen(false),
      accountGroup,
    },
    onNewAccountGroup() {
      setAccountGroup(undefined);
      setIsOpen(true);
    },
    onEditAccountGroup(accountGroup: Serialize<AccountGroup>) {
      setAccountGroup(accountGroup);
      setIsOpen(true);
    },
  };
}

export function EditAccountGroup({
  isOpen,
  onClose,
  accountGroup,
  accountGroups,
}: {
  isOpen: boolean;
  onClose: () => void;
  accountGroup?: Serialize<AccountGroup>;
  accountGroups: Serialize<AccountGroupOption>[];
}) {
  const [selectedType, setSelectedType] = useState<AccountType>(
    accountGroup?.type ?? "ASSET",
  );
  const accountBook = useAccountBook();
  return (
    <FormDialog
      title={accountGroup ? `Edit ${accountGroup.name}` : "New Group"}
      opened={isOpen}
      onClose={onClose}
      size="lg"
      entityId={accountGroup?.id}
      action={
        accountGroup
          ? `/${accountBook.id}/account-groups/update`
          : `/${accountBook.id}/account-groups/create`
      }
    >
      {!!accountGroup && (
        <input type="hidden" name="id" value={accountGroup.id} />
      )}
      <Stack gap="xl">
        <Grid>
          <Grid.Col span={6}>
            <TextInput
              label="Name"
              name="name"
              defaultValue={accountGroup?.name}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <Input.Wrapper label="Type">
              <div>
                <SegmentedControl
                  name="type"
                  fullWidth={true}
                  disabled={!!accountGroup}
                  defaultValue={accountGroup?.type ?? "ASSET"}
                  onChange={(value) => setSelectedType(value as AccountType)}
                  data={[
                    { label: "Asset", value: AccountType.ASSET },
                    { label: "Liability", value: AccountType.LIABILITY },
                    { label: "Equity", value: AccountType.EQUITY },
                  ]}
                />
              </div>
            </Input.Wrapper>
          </Grid.Col>
        </Grid>
        <Grid>
          <Grid.Col span={6}>
            <Select
              label="Parent Group"
              searchable
              defaultValue={accountGroup?.parentGroupId ?? ""}
              name="parentGroupId"
              data={accountGroups
                .filter(
                  (g) => g.type === selectedType && g.id !== accountGroup?.id,
                )
                .map((g) => ({ value: g.id, label: g.path }))}
            />
          </Grid.Col>
          <Grid.Col span={6}>
            <FormattedNumberInput
              label="Sort Order"
              name="sortOrder"
              defaultValue={accountGroup?.sortOrder ?? ""}
            />
          </Grid.Col>
        </Grid>
        <Grid>
          <Grid.Col span={12}>
            <Switch
              name="isActive"
              defaultChecked={accountGroup?.isActive ?? true}
              label="Is Active"
              labelPosition="left"
              description="Inactive account groups are hidden in most places. Deactivating
              this account group will also deactivate all its sub-groups and
              accounts."
            />
          </Grid.Col>
        </Grid>
      </Stack>
      <Group justify="end" mt="xl">
        <CancelButton />
        <CreateOrSaveButton />
      </Group>
    </FormDialog>
  );
}
