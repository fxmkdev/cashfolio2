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
import { useEffect, useMemo, useReducer } from "react";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import {
  validateAccountGroupName,
  validateAccountGroupParentGroupId,
} from "../shared/account-validation";
import { useDialogSubmitState } from "../hooks/use-dialog-submit-state";
import type { ExistingNode } from "./edit-account-modal";
import { GroupTreeSelect, type GroupTreeOption } from "./group-tree-select";

type FormValues = {
  name?: string;
  typeDescriptor?: "ASSET" | "LIABILITY" | `EQUITY-${EquityAccountSubtype}`;
  parentGroupId?: string;
  sortOrder?: number;
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
  sortOrder?: number | null;
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
    sortOrder: initial.sortOrder ?? undefined,
  };
}

function transformAccountGroupValues(
  values: FormValues,
): AccountGroupTransformedFormValues {
  const [type, equityAccountSubtype] = (values.typeDescriptor?.split("-") ??
    []) as [AccountType, EquityAccountSubtype?];

  return {
    ...values,
    type,
    ...(type === AccountType.EQUITY ? { equityAccountSubtype } : undefined),
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
  accountGroups: (GroupTreeOption & {
    type: string;
    equityAccountSubtype: string | null;
  })[];
  onSubmit: (values: AccountGroupTransformedFormValues) => void | Promise<void>;
  initialValues?: AccountGroupInitialValues;
  existingNodes?: ExistingNode[];
  editingId?: string;
  typeDescriptor: FormValues["typeDescriptor"];
}) {
  const isEdit = !!initialValues;
  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  const { isSubmitting, runSubmit } = useDialogSubmitState();
  const descendantGroupIds = useMemo(() => {
    if (!editingId || !existingNodes) return new Set<string>();

    const childGroupsByParentId = new Map<string, string[]>();
    for (const node of existingNodes) {
      if (node.nodeType !== "accountGroup" || !node.parentId) continue;
      const currentChildren = childGroupsByParentId.get(node.parentId) ?? [];
      currentChildren.push(node.id);
      childGroupsByParentId.set(node.parentId, currentChildren);
    }

    const descendants = new Set<string>();
    const stack = [...(childGroupsByParentId.get(editingId) ?? [])];
    while (stack.length > 0) {
      const groupId = stack.pop();
      if (!groupId || descendants.has(groupId)) continue;
      descendants.add(groupId);
      stack.push(...(childGroupsByParentId.get(groupId) ?? []));
    }
    return descendants;
  }, [editingId, existingNodes]);

  const form = useForm<FormValues, AccountGroupTransformedFormValues>({
    mode: "uncontrolled",
    initialValues: initialValues
      ? toFormValues(initialValues)
      : { typeDescriptor },
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
      parentGroupId: (value) =>
        validateAccountGroupParentGroupId(value, {
          editingId,
          descendantGroupIds,
        }),
    },
    transformValues: transformAccountGroupValues,
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

  const { type, equityAccountSubtype } = transformAccountGroupValues(
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
      title={isEdit ? "Edit Group" : "New Group"}
      size="lg"
    >
      <form
        onSubmit={form.onSubmit((values) =>
          runSubmit(() => onSubmit(transformAccountGroupValues(values))),
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
                label="Parent Group"
                searchable
                clearable
                groups={accountGroups.filter(
                  (g) =>
                    g.type === type &&
                    (!equityAccountSubtype ||
                      !g.equityAccountSubtype ||
                      g.equityAccountSubtype === equityAccountSubtype) &&
                    g.value !== editingId &&
                    !descendantGroupIds.has(g.value),
                )}
                {...form.getInputProps("parentGroupId")}
              />
            </Grid.Col>
            <Grid.Col span={3}>
              <NumberInput
                label="Sort Order"
                allowDecimal={false}
                {...form.getInputProps("sortOrder")}
              />
            </Grid.Col>
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
