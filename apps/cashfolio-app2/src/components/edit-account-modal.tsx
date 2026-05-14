import {
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  TextInput,
  Grid,
  Select,
} from "@mantine/core";
import { isNotEmpty, useForm } from "@mantine/form";
import { useEffect, useReducer } from "react";
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
import { FormattedNumberInput } from "./formatted-number-input";
import { GroupTreeSelect, type GroupTreeOption } from "./group-tree-select";
import { CryptocurrencySelect, CurrencySelect } from "./unit-select";

type FormValues = {
  name?: string;
  typeDescriptor?: "ASSET" | "LIABILITY" | `EQUITY-${EquityAccountSubtype}`;
  groupId?: string;
  sortOrder?: number;
  openingBalance?: number | string;
  unit: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
};

export type TransformedFormValues = Omit<FormValues, "openingBalance"> & {
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
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
  openingBalance?: number | null;
};

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
  };
}

function transformAccountValues(values: FormValues): TransformedFormValues {
  const [type, equityAccountSubtype] = (values.typeDescriptor?.split("-") ??
    []) as [AccountType, EquityAccountSubtype?];
  const openingBalance =
    values.openingBalance == null || values.openingBalance === ""
      ? null
      : Number(values.openingBalance);

  return {
    ...values,
    type,
    openingBalance,
    ...(type === AccountType.EQUITY ? { equityAccountSubtype } : undefined),
  };
}

export type ExistingNode = {
  id: string;
  name: string;
  nodeType: string;
  parentId?: string;
  groupId?: string;
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
}: {
  opened: boolean;
  onClose: () => void;
  onExitTransitionEnd?: () => void;
  accountGroups: (GroupTreeOption & {
    type: string;
    equityAccountSubtype: string | null;
  })[];
  onSubmit: (values: TransformedFormValues) => void | Promise<void>;
  initialValues?: AccountInitialValues;
  existingNodes?: ExistingNode[];
  editingId?: string;
  typeDescriptor: FormValues["typeDescriptor"];
  unitUsage?: AccountBookUnitUsage;
}) {
  const isEdit = !!initialValues;
  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  const { isSubmitting, runSubmit } = useDialogSubmitState();
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
      groupId: () => null,
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
    },
    transformValues: transformAccountValues,
    onValuesChange: (values: FormValues, previous: FormValues) => {
      if (values.unit !== previous.unit) {
        forceUpdate();
      }
    },
  });

  useEffect(() => {
    if (opened) {
      if (initialValues) {
        form.setInitialValues(toFormValues(initialValues));
      } else {
        form.setInitialValues({ unit: Unit.CURRENCY, typeDescriptor });
      }
      form.reset();
      forceUpdate();
    }
  }, [opened, initialValues]);

  const { unit, type, equityAccountSubtype } = transformAccountValues(
    form.getValues(),
  );
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
        onSubmit={form.onSubmit((values) => runSubmit(() => onSubmit(values)))}
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
                      g.equityAccountSubtype === equityAccountSubtype),
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
                  locale="en-CH"
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
                    {...form.getInputProps("unit")}
                  />
                </Grid.Col>
                {unit === Unit.CURRENCY ? (
                  <Grid.Col span={9} key={Unit.CURRENCY}>
                    <CurrencySelect
                      label="Currency"
                      withAsterisk
                      withAlignedLabels
                      unitUsage={unitUsage}
                      selectedCurrency={initialValues?.currency}
                      compactLabels={false}
                      {...form.getInputProps("currency")}
                    />
                  </Grid.Col>
                ) : unit === Unit.CRYPTOCURRENCY ? (
                  <Grid.Col span={9} key={Unit.CRYPTOCURRENCY}>
                    <CryptocurrencySelect
                      label="Cryptocurrency"
                      withAsterisk
                      withAlignedLabels
                      unitUsage={unitUsage}
                      selectedCryptocurrency={initialValues?.cryptocurrency}
                      compactLabels={false}
                      {...form.getInputProps("cryptocurrency")}
                    />
                  </Grid.Col>
                ) : unit === Unit.SECURITY ? (
                  <Fragment key={Unit.SECURITY}>
                    <Grid.Col span={3}>
                      <TextInput
                        label="Symbol"
                        withAsterisk
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
                        {...form.getInputProps("tradeCurrency")}
                      />
                    </Grid.Col>
                  </Fragment>
                ) : null}
              </>
            )}
          </Grid>
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
