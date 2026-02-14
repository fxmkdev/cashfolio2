import {
  Button,
  Group,
  Modal,
  Stack,
  TextInput,
  Grid,
  Select,
} from "@mantine/core";
import { isNotEmpty, useForm } from "@mantine/form";
import { useEffect, useReducer } from "react";
import {
  AccountType,
  EquityAccountSubtype,
} from "../.prisma-client/enums";
import {
  validateAccountGroupName,
  validateAccountGroupParentGroupId,
} from "../shared/account-validation";
import type { ExistingNode } from "./edit-account-modal";

type FormValues = {
  name?: string;
  typeDescriptor?: "ASSET" | "LIABILITY" | `EQUITY-${EquityAccountSubtype}`;
  parentGroupId?: string;
};

export type AccountGroupTransformedFormValues = FormValues & {
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
};

export type AccountGroupInitialValues = {
  name: string;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype | null;
  parentGroupId?: string | null;
};

function toFormValues(initial: AccountGroupInitialValues): FormValues {
  const typeDescriptor: FormValues["typeDescriptor"] =
    initial.type === AccountType.EQUITY && initial.equityAccountSubtype
      ? `${AccountType.EQUITY}-${initial.equityAccountSubtype}`
      : (initial.type as "ASSET" | "LIABILITY");

  return {
    name: initial.name,
    typeDescriptor,
    parentGroupId: initial.parentGroupId ?? undefined,
  };
}

export function EditAccountGroupModal({
  opened,
  onClose,
  onExitTransitionEnd,
  accountGroups,
  onSubmit,
  initialValues,
  existingNodes,
  editingId,
  typeDescriptor,
}: {
  opened: boolean;
  onClose: () => void;
  onExitTransitionEnd?: () => void;
  accountGroups: { value: string; label: string; type: string; equityAccountSubtype: string | null }[];
  onSubmit: (values: AccountGroupTransformedFormValues) => void | Promise<void>;
  initialValues?: AccountGroupInitialValues;
  existingNodes?: ExistingNode[];
  editingId?: string;
  typeDescriptor: FormValues["typeDescriptor"];
}) {
  const isEdit = !!initialValues;
  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  const form = useForm<FormValues>({
    mode: "uncontrolled",
    initialValues: initialValues ? toFormValues(initialValues) : { typeDescriptor },
    validate: {
      name: (value, values) => {
        const siblingNames = existingNodes
          ?.filter(
            (n) =>
              n.nodeType === "accountGroup" &&
              n.parentId === values.parentGroupId &&
              n.id !== editingId,
          )
          .map((n) => n.name);
        return validateAccountGroupName(value, siblingNames);
      },
      typeDescriptor: isNotEmpty("Type is required"),
      parentGroupId: (value) => validateAccountGroupParentGroupId(value),
    },
    transformValues: (values) => {
      const [type, equityAccountSubtype] = (values.typeDescriptor?.split("-") ??
        []) as [AccountType, EquityAccountSubtype?];

      return {
        ...values,
        type,
        ...(type === AccountType.EQUITY ? { equityAccountSubtype } : undefined),
      };
    },
  });

  useEffect(() => {
    if (opened) {
      if (initialValues) {
        form.setInitialValues(toFormValues(initialValues));
      } else {
        form.setInitialValues({ typeDescriptor });
      }
      form.reset();
      forceUpdate();
    }
  }, [opened, initialValues]);

  const { type, equityAccountSubtype } =
    form.getTransformedValues() as AccountGroupTransformedFormValues;
  return (
    <Modal opened={opened} onClose={onClose} onExitTransitionEnd={onExitTransitionEnd} title={isEdit ? "Edit Group" : "New Group"} size="lg">
      <form
        onSubmit={form.onSubmit((values) =>
          onSubmit(values as AccountGroupTransformedFormValues)
        )}
      >
        <Stack gap="xl">
          <Grid>
            <Grid.Col span={6}>
              <TextInput
                label="Name"
                name="name"
                withAsterisk
                placeholder="e.g. Bank Accounts"
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
                      {
                        value: `${AccountType.EQUITY}-${EquityAccountSubtype.GAIN_LOSS}`,
                        label: "Gain/Loss",
                      },
                    ],
                  },
                ]}
                {...form.getInputProps("typeDescriptor")}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <Select
                label="Parent Group"
                withAsterisk
                searchable
                withAlignedLabels
                data={accountGroups.filter(
                  (g) =>
                    g.type === type &&
                    (!equityAccountSubtype ||
                      !g.equityAccountSubtype ||
                      g.equityAccountSubtype === equityAccountSubtype),
                )}
                {...form.getInputProps("parentGroupId")}
              />
            </Grid.Col>
          </Grid>
          <Group justify="end">
            <Button variant="subtle" onClick={() => onClose()}>
              Cancel
            </Button>
            <Button variant="filled" type="submit">
              {isEdit ? "Save" : "Create"}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
