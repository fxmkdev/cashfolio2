import { useCallback, useState } from "react";
import type { AccountInitialValues } from "../../../components/edit-account-modal";
import type { AccountGroupInitialValues } from "../../../components/edit-account-group-modal";
import type { TreeRow } from "./-page-types";

export type RowTarget = {
  id: string;
  nodeType: "account" | "accountGroup";
  name: string;
};

export function useAccountsPageModalState() {
  const [createModalOpened, setCreateModalOpened] = useState(false);
  const [editingAccount, setEditingAccount] = useState<
    { id: string; initialValues: AccountInitialValues } | undefined
  >();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [createGroupModalOpened, setCreateGroupModalOpened] = useState(false);
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
    if (data.nodeType === "account") {
      setEditingAccount({
        id: data.id,
        initialValues: {
          name: data.name,
          type: data.type,
          equityAccountSubtype: data.equityAccountSubtype,
          groupId: data.groupId ?? undefined,
          sortOrder: data.sortOrder ?? undefined,
          unit: data.unit,
          currency: data.currency,
          cryptocurrency: data.cryptocurrency,
          symbol: data.symbol,
          tradeCurrency: data.tradeCurrency,
        },
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
        parentGroupId: data.parentId,
        sortOrder: data.sortOrder ?? undefined,
      },
    });
    setEditGroupModalOpen(true);
  }, []);

  return {
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
