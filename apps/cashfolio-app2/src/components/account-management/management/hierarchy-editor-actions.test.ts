import { expect, it, vi } from "vitest";
import type { OrganizeNode } from "@/shared/hierarchy-organize/types";
import { account } from "../grid/asset-class-test-fixtures";
import { toAccountGridTreeRow } from "../grid/rows";
import {
  createHierarchyEditorActions,
  getHierarchyEditRow,
} from "./hierarchy-editor-actions";

const node: OrganizeNode = {
  id: "target",
  nodeType: "account",
  name: "Moved",
  parentId: "new-parent",
  sortOrder: 7,
  isActive: false,
  isCashAccount: false,
  unit: "CURRENCY",
};

it("uses the organizer snapshot for editable relationships without losing account metadata", () => {
  const row = toAccountGridTreeRow(account("target"));
  expect(getHierarchyEditRow([row], node)).toMatchObject({
    ...row,
    name: "Moved",
    parentId: "new-parent",
    persistedParentId: "new-parent",
    groupId: "new-parent",
    sortOrder: 7,
    isActive: false,
  });
  expect(getHierarchyEditRow([row], { ...node, parentId: null })).toMatchObject(
    { parentId: undefined, persistedParentId: null, groupId: undefined },
  );
});

it("allows persisted groups as child targets and protects display headings", () => {
  const group = toAccountGridTreeRow(
    account("target", { nodeType: "accountGroup" }),
  );
  const heading = toAccountGridTreeRow(
    account("heading", { presentationKind: "unit" }),
  );
  const onEdit = vi.fn(),
    onAddChild = vi.fn();
  const actions = createHierarchyEditorActions(
    [group, heading],
    onEdit,
    onAddChild,
  );
  actions.onAddHierarchyChild!(
    { ...node, nodeType: "accountGroup" },
    "account",
  );
  expect(onAddChild).toHaveBeenCalledWith(group, "account");
  onAddChild.mockClear();
  for (const id of ["heading", "missing"]) {
    actions.onEditHierarchyNode!({ ...node, id });
    actions.onAddHierarchyChild!(
      { ...node, id, nodeType: "accountGroup" },
      "accountGroup",
    );
  }
  expect(onEdit).not.toHaveBeenCalled();
  expect(onAddChild).not.toHaveBeenCalled();
  expect(
    getHierarchyEditRow([group], {
      ...node,
      nodeType: "accountGroup",
      parentId: null,
    }),
  ).toMatchObject({ groupId: group.groupId, persistedParentId: null });
});
