import { isAccountGroupCompatible } from "@/shared/account-presentation";
import {
  getAccountEntityLabel,
  isBalanceAccount,
  isCategoryAccount,
} from "@/shared/account-presentation";
import { type EditAccountModalProps } from "./types";
import { assetClassOptions } from "../../shared/asset-class";
import {
  Unit,
  AccountType,
  EquityAccountSubtype,
} from "../../.prisma-client/enums";
import { isAccountGroupCompatibleWithAccountCashRules } from "./account-cash-form-rules";
import {
  Modal,
  Stack,
  Grid,
  TextInput,
  Select,
  NumberInput,
  Group,
  Tooltip,
  Checkbox,
  Button,
} from "@mantine/core";
import { GroupTreeSelect } from "../account-tree/group-tree-select";
import { FormattedNumberInput } from "../controls/formatted-number-input";
import { CurrencySelect, CryptocurrencySelect } from "../controls/unit-select";
import { Fragment } from "react/jsx-runtime";
import { StatementImportCsvFormatField } from "./statement-import-csv-format-field";
import { MutationSubmitFeedback } from "../dialogs/mutation-submit-feedback";
import { useEditAccountModalController } from "./controller";

export function EditAccountModal(props: EditAccountModalProps) {
  const {
    opened,
    onExitTransitionEnd,
    accountGroups,
    onRefreshConstraints,
    initialValues,
    unitUsage,
  } = props;
  const {
    form,
    submitState,
    isSubmitting,
    isEdit,
    statementImportCsvFormatInputId,
    unit,
    type,
    equityAccountSubtype,
    canMarkAsCashAccount,
    cashAccountEditable,
    cashAccountDisabledReason,
    cashAccountValue,
    unitIdentityDisabled,
    handleClose,
    handleSubmit,
  } = useEditAccountModalController(props);
  const entity = getAccountEntityLabel({ type, equityAccountSubtype });
  const isCategory = isCategoryAccount({ type, equityAccountSubtype });
  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      onExitTransitionEnd={onExitTransitionEnd}
      closeOnEscape={!isSubmitting}
      closeOnClickOutside={!isSubmitting}
      withCloseButton={!isSubmitting}
      title={`${isEdit ? "Edit" : "New"} ${entity}`}
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="xl">
          <Grid>
            <Grid.Col span={isCategory ? 6 : 12}>
              <TextInput
                label="Name"
                name="name"
                withAsterisk
                placeholder={
                  isCategory
                    ? equityAccountSubtype === EquityAccountSubtype.INCOME
                      ? "e.g. Salary"
                      : "e.g. Groceries"
                    : "e.g. Checking Account"
                }
                {...form.getInputProps("name")}
              />
            </Grid.Col>
            {isCategory && (
              <Grid.Col span={6}>
                <Select
                  label="Type"
                  withAsterisk
                  withAlignedLabels
                  allowDeselect={false}
                  disabled
                  data={[
                    {
                      group: "Categories",
                      items: [
                        {
                          value: `${AccountType.EQUITY}-${EquityAccountSubtype.INCOME}`,
                          label: "Income",
                        },
                        {
                          value: `${AccountType.EQUITY}-${EquityAccountSubtype.EXPENSE}`,
                          label: "Expense",
                        },
                      ],
                    },
                    {
                      group: "System Accounts",
                      items: [
                        {
                          value: `${AccountType.EQUITY}-${EquityAccountSubtype.OPENING_BALANCES}`,
                          label: "Opening Balances",
                        },
                      ],
                    },
                  ]}
                  {...form.getInputProps("typeDescriptor")}
                />
              </Grid.Col>
            )}
            <Grid.Col span={9}>
              <GroupTreeSelect
                label={isCategory ? "Category Group" : "Group"}
                searchable
                clearable
                groups={accountGroups.filter(
                  (g) =>
                    isAccountGroupCompatible(
                      { type, equityAccountSubtype },
                      g,
                    ) &&
                    isAccountGroupCompatibleWithAccountCashRules({
                      accountType: type,
                      accountUnit: unit,
                      group: g,
                    }),
                )}
                {...form.getInputProps("groupId")}
              />
            </Grid.Col>
            <Grid.Col span={3}>
              <NumberInput
                label="Sort Order"
                allowDecimal={false}
                {...form.getInputProps("sortOrder")}
              />
            </Grid.Col>
            {isBalanceAccount({ type }) && (
              <Grid.Col span={3}>
                <FormattedNumberInput
                  label="Opening Balance"
                  description="Use positive amounts for balances you own and negative amounts for balances you owe."
                  hideControls
                  {...form.getInputProps("openingBalance")}
                />
              </Grid.Col>
            )}
            {isBalanceAccount({ type }) && (
              <>
                <Grid.Col span={12}>
                  <Select
                    label="Asset Class"
                    key={form.key("assetClass")}
                    placeholder="Unclassified"
                    clearable
                    data={[
                      { value: "", label: "Unclassified" },
                      ...assetClassOptions,
                    ]}
                    description="Classifies what this account represents. Future asset-class reports will apply this selection to all historical periods. Changing it does not change total amounts or valuation."
                    {...form.getInputProps("assetClass")}
                  />
                </Grid.Col>
                <Grid.Col span={3}>
                  <Select
                    label="Unit"
                    withAsterisk
                    withAlignedLabels
                    allowDeselect={false}
                    data={[
                      { value: Unit.CURRENCY, label: "Currency" },
                      { value: Unit.CRYPTOCURRENCY, label: "Cryptocurrency" },
                      { value: Unit.SECURITY, label: "Security" },
                    ]}
                    disabled={unitIdentityDisabled}
                    {...form.getInputProps("unit")}
                  />
                </Grid.Col>
                {unit === Unit.CURRENCY ? (
                  <Grid.Col span={6} key={Unit.CURRENCY}>
                    <CurrencySelect
                      label="Currency"
                      withAsterisk
                      withAlignedLabels
                      unitUsage={unitUsage}
                      selectedCurrency={initialValues?.currency}
                      compactLabels={false}
                      disabled={unitIdentityDisabled}
                      {...form.getInputProps("currency")}
                    />
                  </Grid.Col>
                ) : unit === Unit.CRYPTOCURRENCY ? (
                  <Grid.Col span={6} key={Unit.CRYPTOCURRENCY}>
                    <CryptocurrencySelect
                      label="Cryptocurrency"
                      withAsterisk
                      withAlignedLabels
                      unitUsage={unitUsage}
                      selectedCryptocurrency={initialValues?.cryptocurrency}
                      compactLabels={false}
                      disabled={unitIdentityDisabled}
                      {...form.getInputProps("cryptocurrency")}
                    />
                  </Grid.Col>
                ) : unit === Unit.SECURITY ? (
                  <Fragment key={Unit.SECURITY}>
                    <Grid.Col span={3}>
                      <TextInput
                        label="Symbol"
                        withAsterisk
                        disabled={unitIdentityDisabled}
                        {...form.getInputProps("symbol")}
                      />
                    </Grid.Col>
                    <Grid.Col span={6}>
                      <CurrencySelect
                        label="Trade Currency"
                        withAsterisk
                        withAlignedLabels
                        unitUsage={unitUsage}
                        selectedCurrency={initialValues?.tradeCurrency}
                        compactLabels={false}
                        disabled={unitIdentityDisabled}
                        {...form.getInputProps("tradeCurrency")}
                      />
                    </Grid.Col>
                  </Fragment>
                ) : null}
                <Grid.Col span={12}>
                  <StatementImportCsvFormatField
                    inputId={statementImportCsvFormatInputId}
                    inputProps={form.getInputProps("statementImportCsvFormat")}
                  />
                </Grid.Col>
                {canMarkAsCashAccount ? (
                  <Grid.Col span={12}>
                    <Tooltip
                      label={cashAccountDisabledReason}
                      disabled={cashAccountEditable}
                    >
                      <span style={{ display: "inline-flex" }}>
                        <Checkbox
                          label="Cash Account"
                          checked={cashAccountValue}
                          disabled={!cashAccountEditable}
                          onChange={(event) =>
                            form.setFieldValue(
                              "isCashAccount",
                              event.currentTarget.checked,
                            )
                          }
                        />
                      </span>
                    </Tooltip>
                  </Grid.Col>
                ) : null}
              </>
            )}
          </Grid>
          <MutationSubmitFeedback
            state={submitState}
            onRefreshConstraints={onRefreshConstraints}
          />
          <Group justify="end">
            <Button
              variant="subtle"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="filled"
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              {isEdit ? "Save" : "Create"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
