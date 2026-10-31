import { useCallback, useEffect, useState } from "react";
import {
  createAccountInitialValues,
  type AccountInitialValues,
} from "@/components/account-editor/edit-account-modal";
import type { AccountGroupInitialValues } from "@/components/account-editor/edit-account-group-modal";
import type { TreeRow } from "./-page-types";

export type RowTarget = {
  id: string;
  nodeType: "account" | "accountGroup";
  name: string;
};

export function useAccountsPageModalState(scopeKey?: string) {
  const [createModalOpened, setCreateAccountOpened] = useState(false);
  const [createGroupModalOpened, setCreateGroupOpened] = useState(false);
  const [createAccountGroupId, setCreateAccountGroupId] = useState<string>();
  const [createGroupParentId, setCreateGroupParentId] = useState<string>();
  const setCreateModalOpened = useCallback((opened: boolean) => {
    setCreateAccountOpened(opened);
    if (!opened) setCreateAccountGroupId(undefined);
  }, []);
  const setCreateGroupModalOpened = useCallback((opened: boolean) => {
    setCreateGroupOpened(opened);
    if (!opened) setCreateGroupParentId(undefined);
  }, []);
  const openCreateAccount = useCallback((groupId?: string) => {
    setCreateAccountGroupId(groupId);
    setCreateAccountOpened(true);
  }, []);
  const openCreateGroup = useCallback((parentId?: string) => {
    setCreateGroupParentId(parentId);
    setCreateGroupOpened(true);
  }, []);
  useEffect(() => {
    setCreateModalOpened(false);
    setCreateGroupModalOpened(false);
  }, [scopeKey, setCreateModalOpened, setCreateGroupModalOpened]);
  const [editingAccount, setEditingAccount] = useState<
    { id: string; initialValues: AccountInitialValues } | undefined
  >();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<
    { id: string; initialValues: AccountGroupInitialValues } | undefined
  >();
  const [editGroupModalOpen, setEditGroupModalOpen] = useState(false);
  const [archivingRow, setArchivingRow] = useState<RowTarget | undefined>();
  const [deletingRow, setDeletingRow] = useState<RowTarget | undefined>();
  const [reorderingRow, setReorderingRow] = useState<
    { name: string; parentKey: string } | undefined
  >();

  const handleEditRow = useCallback((data: TreeRow) => {
    if (data.isVirtualArchivedGroup) return;
    if (data.nodeType === "account") {
      setEditingAccount({
        id: data.id,
        initialValues: createAccountInitialValues(data),
      });
      setEditModalOpen(true);
      return;
    }

    setEditingGroup({
      id: data.id,
      initialValues: {
        name: data.name,
        type: data.type,
        equityAccountSubtype: data.equityAccountSubtype,
        parentGroupId:
          data.persistedParentId === undefined
            ? data.parentId
            : (data.persistedParentId ?? undefined),
        sortOrder: data.sortOrder ?? undefined,
        isCashAccount: data.isCashAccount ?? false,
      },
    });
    setEditGroupModalOpen(true);
  }, []);

  return {
    createAccountGroupId,
    createGroupParentId,
    openCreateAccount,
    openCreateGroup,
    createModalOpened,
    setCreateModalOpened,
    editingAccount,
    setEditingAccount,
    editModalOpen,
    setEditModalOpen,
    createGroupModalOpened,
    setCreateGroupModalOpened,
    editingGroup,
    setEditingGroup,
    editGroupModalOpen,
    setEditGroupModalOpen,
    archivingRow,
    setArchivingRow,
    deletingRow,
    setDeletingRow,
    reorderingRow,
    setReorderingRow,
    handleEditRow,
  };
}
