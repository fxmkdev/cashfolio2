import { isAccountGroupCompatible } from "@/shared/account-presentation";
import {
  getAccountEntityLabel,
  isBalanceAccount,
  isCategoryAccount,
} from "@/shared/account-presentation";
import { type EditAccountModalProps } from "./types";
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
  Accordion,
} from "@mantine/core";
import { GroupTreeSelect } from "../account-tree/group-tree-select";
import { FormattedNumberInput } from "../controls/formatted-number-input";
import { CurrencySelect, CryptocurrencySelect } from "../controls/unit-select";
import { Fragment } from "react/jsx-runtime";
import { StatementImportCsvFormatField } from "./statement-import-csv-format-field";
import { MutationSubmitFeedback } from "../dialogs/mutation-submit-feedback";
import { useEditAccountModalController } from "./controller";
import { AssetClassField } from "./asset-class-field";

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
    statementImportSettingsOpened,
    setStatementImportSettingsOpened,
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
            <Grid.Col span={{ base: 12, sm: isCategory ? 6 : 12 }}>
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
              <Grid.Col span={{ base: 12, sm: 6 }}>
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
            <Grid.Col span={{ base: 12, sm: 9 }}>
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
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <NumberInput
                label="Sort Order"
                allowDecimal={false}
                {...form.getInputProps("sortOrder")}
              />
            </Grid.Col>
            {isBalanceAccount({ type }) && (
              <>
                <Grid.Col
                  span={{ base: 12, sm: unit === Unit.SECURITY ? 3 : 4 }}
                >
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
                  <Grid.Col span={{ base: 12, sm: 8 }} key={Unit.CURRENCY}>
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
                  <Grid.Col
                    span={{ base: 12, sm: 8 }}
                    key={Unit.CRYPTOCURRENCY}
                  >
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
                    <Grid.Col span={{ base: 12, sm: 3 }}>
                      <TextInput
                        label="Symbol"
                        withAsterisk
                        disabled={unitIdentityDisabled}
                        {...form.getInputProps("symbol")}
                      />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 6 }}>
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
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <FormattedNumberInput
                    label="Opening Balance"
                    description="Positive for balances you own; negative for amounts you owe."
                    inputWrapperOrder={[
                      "label",
                      "input",
                      "description",
                      "error",
                    ]}
                    hideControls
                    {...form.getInputProps("openingBalance")}
                  />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>
                  <AssetClassField
                    key={form.key("assetClass")}
                    {...form.getInputProps("assetClass")}
                  />
                </Grid.Col>
              </>
            )}
          </Grid>
          {isBalanceAccount({ type }) && (
            <Accordion
              variant="separated"
              keepMounted
              value={statementImportSettingsOpened ? "statement-import" : null}
              onChange={(value) =>
                setStatementImportSettingsOpened(value === "statement-import")
              }
            >
              <Accordion.Item value="statement-import">
                <Accordion.Control>Statement Import Settings</Accordion.Control>
                <Accordion.Panel>
                  <StatementImportCsvFormatField
                    key={form.key("statementImportCsvFormat")}
                    inputId={statementImportCsvFormatInputId}
                    inputProps={form.getInputProps("statementImportCsvFormat")}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          )}
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
