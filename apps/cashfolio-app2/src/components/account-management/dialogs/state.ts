import { useCallback, useEffect, useState } from "react";
import {
  createAccountInitialValues,
  type AccountInitialValues,
} from "@/components/account-editor/edit-account-modal";
import type { AccountGroupInitialValues } from "@/components/account-editor/edit-account-group-modal";
import { isPersistedTreeRow, type PersistedTreeRow } from "../grid/rows";

export type RowTarget = {
  id: string;
  nodeType: "account" | "accountGroup";
  name: string;
};

function useAccountCreationState(scopeKey?: string) {
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

  return {
    createAccountGroupId,
    createGroupParentId,
    openCreateAccount,
    openCreateGroup,
    createModalOpened,
    setCreateModalOpened,
    createGroupModalOpened,
    setCreateGroupModalOpened,
  };
}

function useAccountEditorState() {
  const [editingAccount, setEditingAccount] = useState<
    { id: string; initialValues: AccountInitialValues } | undefined
  >();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<
    { id: string; initialValues: AccountGroupInitialValues } | undefined
  >();
  const [editGroupModalOpen, setEditGroupModalOpen] = useState(false);

  const handleEditRow = useCallback((data: PersistedTreeRow) => {
    if (!isPersistedTreeRow(data)) return;
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

  const resetEditors = useCallback(() => {
    setEditModalOpen(false);
    setEditGroupModalOpen(false);
    setEditingAccount(undefined);
    setEditingGroup(undefined);
  }, []);
  return {
    editingAccount,
    setEditingAccount,
    editModalOpen,
    setEditModalOpen,
    editingGroup,
    setEditingGroup,
    editGroupModalOpen,
    setEditGroupModalOpen,
    handleEditRow,
    resetEditors,
  };
}

export function useAccountsPageModalState(
  scopeKey?: string,
  resetEditorsOnScopeChange = false,
) {
  const creation = useAccountCreationState(scopeKey);
  const { resetEditors, ...editors } = useAccountEditorState();
  const [movingRow, setMovingRow] = useState<RowTarget>();
  useEffect(() => setMovingRow(undefined), [scopeKey]);
  const [archivingRow, setArchivingRow] = useState<RowTarget | undefined>();
  const [deletingRow, setDeletingRow] = useState<RowTarget | undefined>();
  useEffect(() => {
    if (!resetEditorsOnScopeChange) return;
    resetEditors();
    setArchivingRow(undefined);
    setDeletingRow(undefined);
  }, [scopeKey, resetEditorsOnScopeChange, resetEditors]);
  return {
    ...creation,
    ...editors,
    movingRow,
    setMovingRow,
    archivingRow,
    setArchivingRow,
    deletingRow,
    setDeletingRow,
  };
}
