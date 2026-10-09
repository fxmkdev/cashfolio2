import {
  ActionIcon,
  Box,
  Button,
  Code,
  CopyButton,
  Group,
  Input,
  Popover,
  Modal,
  NumberInput,
  Stack,
  Text,
  TextInput,
  Grid,
  Select,
  Textarea,
  Tooltip,
  Checkbox,
} from "@mantine/core";
import { isNotEmpty, useForm } from "@mantine/form";
import { IconCheck, IconCopy, IconInfoCircle } from "@tabler/icons-react";
import { useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import { Fragment } from "react/jsx-runtime";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import type { AccountBookUnitUsage } from "../shared/account-book-unit-usage";
import {
  validateAccountName,
  validateAccountUnit,
  validateAccountCurrency,
  validateAccountCryptocurrency,
  validateAccountSymbol,
  validateAccountTradeCurrency,
} from "../shared/account-validation";
import { useDialogSubmitState } from "../hooks/use-dialog-submit-state";
import {
  applyAccountGroupCashInheritance,
  getAccountCashParentCompatibilityError,
  getCashAccountDisabledReason,
  isAccountGroupCompatibleWithAccountCashRules,
  isRootCashAccountEditable,
  resolveAccountCashAccountFormValue,
  type AccountGroupOption,
  type ExistingNode,
} from "./account-cash-form-rules";
import { FormattedNumberInput } from "./formatted-number-input";
import { GroupTreeSelect } from "./group-tree-select";
import { CryptocurrencySelect, CurrencySelect } from "./unit-select";
import {
  parseStatementImportCsvFormatJson,
  type StatementImportCsvFormat,
} from "@/shared/statement-import-csv-format";

const STATEMENT_IMPORT_CSV_FORMAT_EXAMPLE = JSON.stringify(
  {
    hasHeader: true,
    delimitersToGuess: [",", ";"],
    columns: [
      "date",
      "amount",
      "original amount",
      "original currency",
      "exchange rate",
      "description",
    ],
    dateFormat: "yyyy-MM-dd",
    numberFormat: {
      decimalSeparator: ".",
    },
  },
  null,
  2,
);
const STATEMENT_IMPORT_CSV_FORMAT_PLACEHOLDER =
  "Paste a statement import CSV format JSON object.";
const STATEMENT_IMPORT_CSV_FORMAT_HELP_VIEWPORT_PADDING = 12;

function StatementImportCsvFormatHelp() {
  return (
    <Popover
      width={420}
      position="bottom-start"
      withArrow
      shadow="md"
      withinPortal
      middlewares={{
        flip: true,
        shift: { padding: STATEMENT_IMPORT_CSV_FORMAT_HELP_VIEWPORT_PADDING },
      }}
    >
      <Popover.Target>
        <Tooltip label="Show CSV format JSON help">
          <ActionIcon
            aria-label="Show statement import CSV format help"
            size="sm"
            variant="subtle"
          >
            <IconInfoCircle size={16} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm">
            Use ordered columns for positional CSVs. Use mappings with index or
            header refs for custom layouts. Leave the field empty to make
            imports unavailable for this account.
          </Text>
          <Box mah="32vh" style={{ overflow: "auto" }}>
            <Code block>{STATEMENT_IMPORT_CSV_FORMAT_EXAMPLE}</Code>
          </Box>
          <CopyButton value={STATEMENT_IMPORT_CSV_FORMAT_EXAMPLE}>
            {({ copied, copy }) => (
              <Button
                leftSection={
                  copied ? <IconCheck size={16} /> : <IconCopy size={16} />
                }
                onClick={copy}
                size="xs"
                variant="light"
              >
                {copied ? "Copied" : "Copy example"}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

export type AccountTypeDescriptor =
  "ASSET" | "LIABILITY" | `EQUITY-${EquityAccountSubtype}`;

type FormValues = {
  name?: string;
  typeDescriptor?: AccountTypeDescriptor;
  groupId?: string;
  sortOrder?: number;
  openingBalance?: number | string;
  unit: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
  statementImportCsvFormat?: string;
  isCashAccount?: boolean;
};

export type TransformedFormValues = Omit<
  FormValues,
  | "openingBalance"
  | "unit"
  | "currency"
  | "cryptocurrency"
  | "symbol"
  | "tradeCurrency"
  | "statementImportCsvFormat"
> & {
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  unit?: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
  statementImportCsvFormat?: StatementImportCsvFormat | null;
  isCashAccount?: boolean;
  openingBalance?: number | null;
};

export type AccountInitialValues = {
  name: string;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype | null;
  groupId?: string | null;
  sortOrder?: number | null;
  unit?: Unit | null;
  currency?: string | null;
  cryptocurrency?: string | null;
  symbol?: string | null;
  tradeCurrency?: string | null;
  statementImportCsvFormat?: StatementImportCsvFormat | null;
  isCashAccount?: boolean | null;
  openingBalance?: number | null;
};

export type AccountInitialValuesSource = Pick<
  AccountInitialValues,
  | "name"
  | "type"
  | "equityAccountSubtype"
  | "groupId"
  | "sortOrder"
  | "unit"
  | "currency"
  | "cryptocurrency"
  | "symbol"
  | "tradeCurrency"
  | "statementImportCsvFormat"
  | "isCashAccount"
  | "openingBalance"
>;

export function createAccountInitialValues(
  source: AccountInitialValuesSource,
): AccountInitialValues {
  return {
    name: source.name,
    type: source.type,
    equityAccountSubtype: source.equityAccountSubtype,
    groupId: source.groupId ?? undefined,
    sortOrder: source.sortOrder ?? undefined,
    unit: source.unit,
    currency: source.currency,
    cryptocurrency: source.cryptocurrency,
    symbol: source.symbol,
    tradeCurrency: source.tradeCurrency,
    statementImportCsvFormat: source.statementImportCsvFormat ?? null,
    isCashAccount: source.isCashAccount ?? false,
    openingBalance: source.openingBalance,
  };
}

function toFormValues(initial: AccountInitialValues): FormValues {
  const typeDescriptor: FormValues["typeDescriptor"] =
    initial.type === AccountType.EQUITY && initial.equityAccountSubtype
      ? `${AccountType.EQUITY}-${initial.equityAccountSubtype}`
      : (initial.type as "ASSET" | "LIABILITY");

  return {
    name: initial.name,
    typeDescriptor,
    groupId: initial.groupId ?? undefined,
    sortOrder: initial.sortOrder ?? undefined,
    openingBalance: initial.openingBalance ?? undefined,
    unit: initial.unit ?? Unit.CURRENCY,
    currency: initial.currency ?? undefined,
    cryptocurrency: initial.cryptocurrency ?? undefined,
    symbol: initial.symbol ?? undefined,
    tradeCurrency: initial.tradeCurrency ?? undefined,
    statementImportCsvFormat: initial.statementImportCsvFormat
      ? JSON.stringify(initial.statementImportCsvFormat, null, 2)
      : undefined,
    isCashAccount: initial.isCashAccount ?? false,
  };
}

export function validateStatementImportCsvFormatFormValue(
  value: string | undefined,
  typeDescriptor?: AccountTypeDescriptor,
): string | null {
  if (
    typeDescriptor !== AccountType.ASSET &&
    typeDescriptor !== AccountType.LIABILITY
  ) {
    return null;
  }

  return parseStatementImportCsvFormatJson(value).errors[0] ?? null;
}

export function transformAccountValues(
  values: FormValues,
): TransformedFormValues {
  const [type, equityAccountSubtype] = (values.typeDescriptor?.split("-") ??
    []) as [AccountType, EquityAccountSubtype?];
  const openingBalance =
    values.openingBalance == null || values.openingBalance === ""
      ? null
      : Number(values.openingBalance);
  const transformed = {
    ...values,
    type,
    openingBalance,
    statementImportCsvFormat: parseStatementImportCsvFormatJson(
      values.statementImportCsvFormat,
    ).format,
    ...(type === AccountType.EQUITY ? { equityAccountSubtype } : undefined),
  };

  if (type === AccountType.EQUITY) {
    return {
      ...transformed,
      unit: undefined,
      currency: undefined,
      cryptocurrency: undefined,
      symbol: undefined,
      tradeCurrency: undefined,
      statementImportCsvFormat: null,
      isCashAccount: false,
    };
  }

  return {
    ...transformed,
    isCashAccount:
      type === AccountType.ASSET && values.unit === Unit.CURRENCY
        ? (values.isCashAccount ?? false)
        : false,
  };
}

export type EditAccountModalProps = {
  opened: boolean;
  onClose: () => void;
  onExitTransitionEnd?: () => void;
  accountGroups: AccountGroupOption[];
  onSubmit: (values: TransformedFormValues) => void | Promise<void>;
  initialValues?: AccountInitialValues;
  existingNodes?: ExistingNode[];
  editingId?: string;
  typeDescriptor: AccountTypeDescriptor;
  unitUsage?: AccountBookUnitUsage;
};

export function EditAccountModal({
  opened,
  onClose,
  onExitTransitionEnd,
  accountGroups,
  onSubmit,
  initialValues,
  existingNodes,
  editingId,
  typeDescriptor,
  unitUsage,
}: EditAccountModalProps) {
  const isEdit = !!initialValues;
  const statementImportCsvFormatInputId = useId();
  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  const { isSubmitting, runSubmit } = useDialogSubmitState();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<FormValues, TransformedFormValues>({
    mode: "uncontrolled",
    initialValues: initialValues
      ? toFormValues(initialValues)
      : { unit: Unit.CURRENCY, typeDescriptor },
    validate: {
      name: (value, values) => {
        const siblingNames = existingNodes
          ?.filter(
            (n) =>
              n.nodeType === "account" &&
              n.groupId === values.groupId &&
              n.id !== editingId,
          )
          .map((n) => n.name);
        return validateAccountName(value, siblingNames);
      },
      typeDescriptor: isNotEmpty("Type is required"),
      groupId: (value, values) =>
        getAccountCashParentCompatibilityError({
          accountType: transformAccountValues(values).type,
          accountUnit: values.unit,
          groupId: value,
          accountGroups,
        }),
      openingBalance: (value, values) => {
        if (
          values.typeDescriptor !== AccountType.ASSET &&
          values.typeDescriptor !== AccountType.LIABILITY
        ) {
          return null;
        }
        if (value == null || value === "") {
          return null;
        }
        return Number.isFinite(Number(value))
          ? null
          : "Opening balance is invalid";
      },
      unit: (value, values) =>
        validateAccountUnit(value, values.typeDescriptor as AccountType),
      currency: (value, values) =>
        validateAccountCurrency(
          value,
          values.unit,
          values.typeDescriptor as AccountType,
        ),
      cryptocurrency: (value, values) =>
        validateAccountCryptocurrency(
          value,
          values.unit,
          values.typeDescriptor as AccountType,
        ),
      symbol: (value, values) =>
        validateAccountSymbol(
          value,
          values.unit,
          values.typeDescriptor as AccountType,
        ),
      tradeCurrency: (value, values) =>
        validateAccountTradeCurrency(
          value,
          values.unit,
          values.typeDescriptor as AccountType,
        ),
      statementImportCsvFormat: (value, values) =>
        validateStatementImportCsvFormatFormValue(value, values.typeDescriptor),
    },
    transformValues: transformAccountValues,
    onValuesChange: (values: FormValues, previous: FormValues) => {
      if (
        values.unit !== previous.unit ||
        values.typeDescriptor !== previous.typeDescriptor ||
        values.groupId !== previous.groupId
      ) {
        setSubmitError(null);
        forceUpdate();
      }
    },
  });
  const formRef = useRef(form);
  formRef.current = form;
  const resetInitialValues = useMemo(
    () =>
      initialValues
        ? toFormValues(initialValues)
        : { unit: Unit.CURRENCY, typeDescriptor },
    [initialValues, typeDescriptor],
  );

  useEffect(() => {
    if (opened) {
      const currentForm = formRef.current;
      currentForm.setInitialValues(resetInitialValues);
      currentForm.reset();
      setSubmitError(null);
      forceUpdate();
    }
  }, [opened, resetInitialValues]);

  const { unit, type, equityAccountSubtype } = transformAccountValues(
    form.getValues(),
  );
  const canMarkAsCashAccount =
    type === AccountType.ASSET && unit === Unit.CURRENCY;
  const groupId = form.getValues().groupId;
  const cashAccountEditable = isRootCashAccountEditable({
    type,
    unit,
    groupId,
  });
  const cashAccountDisabledReason = getCashAccountDisabledReason({
    type,
    unit,
    groupId,
  });
  const cashAccountValue = resolveAccountCashAccountFormValue({
    type,
    unit,
    groupId,
    isCashAccount: form.getValues().isCashAccount,
    accountGroups,
  });
  const unitIdentityDisabled = isEdit;
  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      onExitTransitionEnd={onExitTransitionEnd}
      closeOnEscape={!isSubmitting}
      closeOnClickOutside={!isSubmitting}
      withCloseButton={!isSubmitting}
      title={isEdit ? "Edit Account" : "New Account"}
      size="lg"
    >
      <form
        onSubmit={form.onSubmit((values) => {
          setSubmitError(null);
          return runSubmit(async () => {
            try {
              await onSubmit(
                applyAccountGroupCashInheritance(values, accountGroups),
              );
            } catch (error) {
              setSubmitError(
                error instanceof Error
                  ? error.message
                  : "Failed to save account.",
              );
            }
          });
        })}
      >
        <Stack gap="xl">
          <Grid>
            <Grid.Col span={6}>
              <TextInput
                label="Name"
                name="name"
                withAsterisk
                placeholder="e.g. Checking Account"
                {...form.getInputProps("name")}
              />
            </Grid.Col>
            <Grid.Col span={6}>
              <Select
                label="Type"
                withAsterisk
                withAlignedLabels
                allowDeselect={false}
                disabled
                data={[
                  {
                    group: "Position Accounts (Non-Equity)",
                    items: [
                      {
                        value: AccountType.ASSET,
                        label: "Asset",
                      },
                      {
                        value: AccountType.LIABILITY,
                        label: "Liability",
                      },
                    ],
                  },
                  {
                    group: "Flow Accounts (Equity)",
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
            <Grid.Col span={9}>
              <GroupTreeSelect
                label="Group"
                searchable
                clearable
                groups={accountGroups.filter(
                  (g) =>
                    g.type === type &&
                    (!equityAccountSubtype ||
                      !g.equityAccountSubtype ||
                      g.equityAccountSubtype === equityAccountSubtype) &&
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
            {(
              [AccountType.ASSET, AccountType.LIABILITY] as AccountType[]
            ).includes(type) && (
              <Grid.Col span={3}>
                <FormattedNumberInput
                  label="Opening Balance"
                  hideControls
                  {...form.getInputProps("openingBalance")}
                />
              </Grid.Col>
            )}
            {(
              [AccountType.ASSET, AccountType.LIABILITY] as AccountType[]
            ).includes(type) && (
              <>
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
                  <Stack gap={4}>
                    <Group gap={4}>
                      <Input.Label htmlFor={statementImportCsvFormatInputId}>
                        Statement import CSV format
                      </Input.Label>
                      <StatementImportCsvFormatHelp />
                    </Group>
                    <Textarea
                      id={statementImportCsvFormatInputId}
                      description="Required for statement imports. Open help to copy an example format."
                      placeholder={STATEMENT_IMPORT_CSV_FORMAT_PLACEHOLDER}
                      autosize
                      minRows={6}
                      maxRows={12}
                      {...form.getInputProps("statementImportCsvFormat")}
                    />
                  </Stack>
                </Grid.Col>
                {canMarkAsCashAccount ? (
                  <Grid.Col span={12}>
                    <Tooltip
                      label={cashAccountDisabledReason}
                      disabled={cashAccountEditable}
                    >
                      <span style={{ display: "inline-flex" }}>
                        <Checkbox
                          label="Cash account"
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
          {submitError && (
            <Text size="sm" c="red">
              {submitError}
            </Text>
          )}
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
