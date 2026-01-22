import type { Account } from "~/.prisma-client/client";
import { useEffect, useState } from "react";
import { DialogActions } from "~/platform/dialog";
import type { Serialize } from "~/serialization";
import type { AccountGroupOption } from "~/types";
import {
  CancelButton,
  FormDialog,
  CreateOrSaveButton,
} from "~/platform/forms/form-dialog";
import { useAccountBook } from "~/account-books/hooks";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "~/.prisma-client/enums";
import {
  Grid,
  Input,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import { currencies } from "~/currencies";
import { cryptocurrencies } from "~/cryptocurrencies";

export function useEditAccount() {
  const [isOpen, setIsOpen] = useState(false);
  const [account, setAccount] = useState<Serialize<Account>>();
  return {
    editAccountProps: {
      isOpen,
      onClose: () => setIsOpen(false),
      account,
    },
    onNewAccount() {
      setAccount(undefined);
      setIsOpen(true);
    },
    onEditAccount(account: Serialize<Account>) {
      setAccount(account);
      setIsOpen(true);
    },
  };
}

export function EditAccount({
  isOpen,
  onClose,
  account,
  accountGroups,
}: {
  isOpen: boolean;
  onClose: () => void;
  account?: Serialize<Account>;
  accountGroups: Serialize<AccountGroupOption>[];
}) {
  const [selectedUnit, setSelectedUnit] = useState<Unit>(Unit.CURRENCY);
  const [selectedType, setSelectedType] = useState<AccountType>(
    AccountType.ASSET,
  );
  useEffect(() => {
    setSelectedUnit(account?.unit ?? "CURRENCY");
    setSelectedType(account?.type ?? "ASSET");
  }, [account?.id]);
  const accountBook = useAccountBook();
  return (
    <FormDialog
      size="lg"
      title={account ? `Edit ${account.name}` : "New Account"}
      opened={isOpen}
      onClose={onClose}
      entityId={account?.id}
      action={
        account
          ? `/${accountBook.id}/accounts/update`
          : `/${accountBook.id}/accounts/create`
      }
    >
      {!!account && <input type="hidden" name="id" value={account.id} />}
      <Stack gap="xl">
        <Grid>
          <Grid.Col span={6}>
            <TextInput name="name" defaultValue={account?.name} label="Name" />
          </Grid.Col>

          <Grid.Col span={6}>
            <Input.Wrapper label="Type">
              <div>
                <SegmentedControl
                  name="type"
                  fullWidth={true}
                  disabled={!!account}
                  defaultValue={account?.type || AccountType.ASSET}
                  onChange={(value) => setSelectedType(value as AccountType)}
                  data={[
                    { label: "Asset", value: AccountType.ASSET },
                    { label: "Liability", value: AccountType.LIABILITY },
                    { label: "Equity", value: AccountType.EQUITY },
                  ]}
                />
              </div>
            </Input.Wrapper>
            {!!account && (
              <input type="hidden" name="type" value={account.type} />
            )}
          </Grid.Col>
        </Grid>
        {selectedType === AccountType.EQUITY && (
          <Grid>
            <Grid.Col span={6}>
              <Input.Wrapper label="Subtype">
                <div>
                  <SegmentedControl
                    name="equityAccountSubtype"
                    fullWidth={true}
                    defaultValue={
                      account?.equityAccountSubtype ||
                      EquityAccountSubtype.GAIN_LOSS
                    }
                    data={[
                      {
                        label: "Gain/Loss",
                        value: EquityAccountSubtype.GAIN_LOSS,
                      },
                      { label: "Income", value: EquityAccountSubtype.INCOME },
                      { label: "Expense", value: EquityAccountSubtype.EXPENSE },
                    ]}
                  />
                </div>
              </Input.Wrapper>
            </Grid.Col>
          </Grid>
        )}

        <Grid>
          <Grid.Col span={12}>
            <Select
              label="Group"
              searchable
              name="groupId"
              defaultValue={account?.groupId}
              data={accountGroups
                .filter((g) => g.type === selectedType)
                .map((g) => ({ value: g.id, label: g.path }))}
            />
          </Grid.Col>
        </Grid>
        {selectedType !== AccountType.EQUITY && (
          <>
            <Grid>
              <Grid.Col span={12}>
                <Input.Wrapper label="Unit">
                  <div>
                    <SegmentedControl
                      name="unit"
                      defaultValue={account?.unit || Unit.CURRENCY}
                      onChange={(v) => setSelectedUnit(v as Unit)}
                      data={[
                        { label: "Currency", value: Unit.CURRENCY },
                        {
                          label: "Cryptocurrency",
                          value: Unit.CRYPTOCURRENCY,
                        },
                        { label: "Security", value: Unit.SECURITY },
                      ]}
                    />
                  </div>
                </Input.Wrapper>
              </Grid.Col>
            </Grid>
            <Grid>
              {selectedUnit === Unit.CURRENCY && (
                <Grid.Col span={6}>
                  <Select
                    label="Currency"
                    searchable
                    name="currency"
                    defaultValue={
                      account?.currency || accountBook.referenceCurrency
                    }
                    data={Object.keys(currencies)}
                  />
                </Grid.Col>
              )}
              {selectedUnit === Unit.CRYPTOCURRENCY && (
                <Grid.Col span={6}>
                  <Select
                    label="Cryptocurrency"
                    searchable
                    name="cryptocurrency"
                    defaultValue={account?.cryptocurrency || ""}
                    data={Object.keys(cryptocurrencies)}
                  />
                </Grid.Col>
              )}
              {selectedUnit === Unit.SECURITY && (
                <>
                  <Grid.Col span={6}>
                    <TextInput
                      label="Symbol"
                      name="symbol"
                      defaultValue={account?.symbol || ""}
                    />
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <Select
                      label="Trade Ccy."
                      searchable
                      name="tradeCurrency"
                      defaultValue={account?.tradeCurrency || ""}
                      data={Object.keys(currencies)}
                    />
                  </Grid.Col>
                </>
              )}
            </Grid>
          </>
        )}
        <Grid>
          <Grid.Col span={12}>
            <Switch
              name="isActive"
              defaultChecked={account?.isActive ?? true}
              label="Is Active"
              labelPosition="left"
              description="Inactive accounts are hidden in most places. Use this if the
                account was closed or is not used anymore actively."
            />
          </Grid.Col>
        </Grid>
      </Stack>
      <DialogActions>
        <CancelButton />
        <CreateOrSaveButton />
      </DialogActions>
    </FormDialog>
  );
}
