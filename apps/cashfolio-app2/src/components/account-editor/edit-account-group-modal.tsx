import { isAccountGroupCompatible } from "@/shared/account-presentation";
import {
  isCategoryAccount,
  getAccountConstraintMessage,
} from "@/shared/account-presentation";
import { MutationSubmitFeedback } from "../dialogs/mutation-submit-feedback";
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  TextInput,
  Grid,
  Select,
  Checkbox,
  Tooltip,
} from "@mantine/core";
import { isNotEmpty, useForm } from "@mantine/form";
import { useEffect, useMemo, useReducer, useRef } from "react";
import { AccountType, EquityAccountSubtype } from "../../.prisma-client/enums";
import {
  validateAccountGroupName,
  validateAccountGroupParentGroupId,
} from "../../shared/account-validation";
import { useDialogSubmitState } from "../../hooks/use-dialog-submit-state";
import {
  applyAccountGroupParentCashInheritance,
  getAccountGroupCashParentCompatibilityError,
  getCashAccountGroupDisabledReason,
  isRootCashAccountGroupEditable,
  resolveAccountGroupCashAccountFormValue,
  type AccountGroupOption,
  type ExistingNode,
} from "./account-cash-form-rules";
import { GroupTreeSelect } from "../account-tree/group-tree-select";

type FormValues = {
  name?: string;
  typeDescriptor?:
    "BALANCE" | "ASSET" | "LIABILITY" | `EQUITY-${EquityAccountSubtype}`;
  parentGroupId?: string;
  sortOrder?: number;
  isCashAccount?: boolean;
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
  isCashAccount?: boolean | null;
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
    isCashAccount: initial.isCashAccount ?? false,
  };
}

function transformAccountGroupValues(
  values: FormValues,
): AccountGroupTransformedFormValues {
  const [descriptorType, equityAccountSubtype] = (values.typeDescriptor?.split(
    "-",
  ) ?? []) as [AccountType | "BALANCE", EquityAccountSubtype?];
  const type =
    descriptorType === "BALANCE" ? AccountType.ASSET : descriptorType;

  return {
    ...values,
    type,
    isCashAccount:
      type === AccountType.ASSET || type === AccountType.LIABILITY
        ? (values.isCashAccount ?? false)
        : false,
    ...(type === AccountType.EQUITY ? { equityAccountSubtype } : undefined),
  };
}

export function EditAccountGroupModal({
  opened,
  onClose,
  onExitTransitionEnd,
  accountGroups,
  onSubmit,
  onRefreshConstraints,
  initialValues,
  existingNodes,
  editingId,
  typeDescriptor,
}: {
  opened: boolean;
  onClose: () => void;
  onRefreshConstraints?: () => Promise<void>;
  onExitTransitionEnd?: () => void;
  accountGroups: AccountGroupOption[];
  onSubmit: (values: AccountGroupTransformedFormValues) => void | Promise<void>;
  initialValues?: AccountGroupInitialValues;
  existingNodes?: ExistingNode[];
  editingId?: string;
  typeDescriptor: FormValues["typeDescriptor"];
}) {
  const isEdit = !!initialValues;
  const [, forceUpdate] = useReducer((x) => x + 1, 0);
  const submitState = useDialogSubmitState({
    captureErrors: true,
    formatErrorMessage: (message) =>
      getAccountConstraintMessage(
        message,
        typeDescriptor?.startsWith("EQUITY-") ? "categories" : "accounts",
      ) ?? message,
    onRefreshConstraints,
  });
  const { isSubmitting, runSubmit, clearSubmissionError } = submitState;
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
        return (
          getAccountConstraintMessage(
            validateAccountGroupName(value, siblingNames),
            typeDescriptor?.startsWith("EQUITY-") ? "categories" : "accounts",
          ) ?? null
        );
      },
      typeDescriptor: isNotEmpty("Type is required"),
      parentGroupId: (value, values) =>
        (value && !accountGroups.some((group) => group.value === value)
          ? "The selected group is no longer available. Choose another group or clear the selection."
          : null) ??
        validateAccountGroupParentGroupId(value, {
          editingId,
          descendantGroupIds,
        }) ??
        getAccountGroupCashParentCompatibilityError({
          type: transformAccountGroupValues(values).type,
          parentGroupId: value,
          groupId: editingId,
          accountGroups,
          existingNodes,
        }),
      isCashAccount: (value, values) => {
        if (!value) return null;
        return (
          getCashAccountGroupDisabledReason({
            type: transformAccountGroupValues(values).type,
            parentGroupId: values.parentGroupId,
            groupId: editingId,
            existingNodes,
          }) ?? null
        );
      },
    },
    transformValues: transformAccountGroupValues,
    onValuesChange: (values: FormValues, previous: FormValues) => {
      if (
        values.parentGroupId !== previous.parentGroupId ||
        values.typeDescriptor !== previous.typeDescriptor
      ) {
        clearSubmissionError();
        forceUpdate();
      }
    },
  });
  const formRef = useRef(form);
  formRef.current = form;
  const resetInitialValues = useMemo(
    () => (initialValues ? toFormValues(initialValues) : { typeDescriptor }),
    [initialValues, typeDescriptor],
  );

  const initializedSession = useRef<string | null>(null);
  useEffect(() => {
    if (!opened) {
      initializedSession.current = null;
      return;
    }
    const session = `${editingId ?? "create"}/${typeDescriptor}`;
    if (initializedSession.current !== session) {
      initializedSession.current = session;
      const currentForm = formRef.current;
      currentForm.setInitialValues(resetInitialValues);
      currentForm.reset();
      clearSubmissionError();
      forceUpdate();
    }
  }, [
    opened,
    editingId,
    typeDescriptor,
    resetInitialValues,
    clearSubmissionError,
  ]);

  const { type, equityAccountSubtype } = transformAccountGroupValues(
    form.getValues(),
  );
  const parentGroupId = form.getValues().parentGroupId;
  const cashAccountEditable = isRootCashAccountGroupEditable({
    type,
    parentGroupId,
  });
  const cashAccountDisabledReason = getCashAccountGroupDisabledReason({
    type,
    parentGroupId,
    groupId: editingId,
    existingNodes,
  });
  const cashAccountValue = resolveAccountGroupCashAccountFormValue({
    type,
    parentGroupId,
    isCashAccount: form.getValues().isCashAccount,
    accountGroups,
  });
  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const isCategory = isCategoryAccount({ type, equityAccountSubtype });
  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      onExitTransitionEnd={onExitTransitionEnd}
      closeOnEscape={!isSubmitting}
      closeOnClickOutside={!isSubmitting}
      withCloseButton={!isSubmitting}
      title={`${isEdit ? "Edit" : "New"} ${isCategory ? "Category Group" : "Group"}`}
      size="lg"
    >
      <form
        onSubmit={form.onSubmit((values) => {
          clearSubmissionError();
          return runSubmit(async () => {
            await onSubmit(
              applyAccountGroupParentCashInheritance(
                transformAccountGroupValues(values),
                accountGroups,
              ),
            );
          });
        })}
      >
        <Stack gap="xl">
          <Grid>
            <Grid.Col span={isCategory ? 6 : 12}>
              <TextInput
                label="Name"
                name="name"
                withAsterisk
                placeholder={isCategory ? "e.g. Housing" : "e.g. Bank Accounts"}
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
                      group: "Accounts",
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
                label={isCategory ? "Parent Category Group" : "Parent Group"}
                searchable
                clearable
                groups={accountGroups.filter(
                  (g) =>
                    isAccountGroupCompatible(
                      { type, equityAccountSubtype },
                      g,
                    ) &&
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
            {type === AccountType.ASSET || type === AccountType.LIABILITY ? (
              <Grid.Col span={12}>
                <Tooltip
                  label={cashAccountDisabledReason}
                  disabled={!cashAccountDisabledReason}
                >
                  <span style={{ display: "inline-flex" }}>
                    <Checkbox
                      label="Cash Account"
                      checked={cashAccountValue}
                      disabled={
                        !!cashAccountDisabledReason || !cashAccountEditable
                      }
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
