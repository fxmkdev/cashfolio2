import {
  assertRecord,
  requireArrayField,
  requireBooleanField,
  requireEnumField,
  requireIntegerField,
  requireStringField,
} from "../input-validation";
import type {
  OrganizeMove,
  OrganizeNodeRef,
  OrganizeRestore,
  OrganizeUndo,
} from "../../shared/account-organize/types";

function readRef(value: unknown): OrganizeNodeRef {
  assertRecord(value);
  return {
    id: requireStringField(value, "id"),
    nodeType: requireEnumField(value, "nodeType", [
      "account",
      "accountGroup",
    ] as const),
  };
}

export function validateOrganizeBook(data: unknown) {
  assertRecord(data);
  return { accountBookId: requireStringField(data, "accountBookId") };
}

function readParent(data: Record<string, unknown>) {
  return data.parentId === null ? null : requireStringField(data, "parentId");
}

export function validateOrganizeMove(
  data: unknown,
): OrganizeMove & { accountBookId: string; version: string } {
  assertRecord(data);
  return {
    ...validateOrganizeBook(data),
    version: requireStringField(data, "version"),
    items: Array.from(requireArrayField(data, "items"), readRef),
    parentId: readParent(data),
    placement: requireEnumField(data, "placement", [
      "first",
      "last",
      "before",
      "after",
    ] as const),
    anchorId:
      data.anchorId === undefined
        ? undefined
        : requireStringField(data, "anchorId"),
  };
}

export function validateOrganizeUndo(data: unknown): {
  accountBookId: string;
  undo: OrganizeUndo;
} {
  assertRecord(data);
  assertRecord(data.undo);
  const undo = data.undo;
  return {
    ...validateOrganizeBook(data),
    undo: {
      version: requireStringField(undo, "version"),
      restore: Array.from(
        requireArrayField(undo, "restore"),
        (value): OrganizeRestore => {
          assertRecord(value);
          return {
            ...readRef(value),
            parentId: readParent(value),
            sortOrder:
              value.sortOrder === null
                ? null
                : requireIntegerField(value, "sortOrder"),
            isCashAccount: requireBooleanField(value, "isCashAccount"),
          };
        },
      ),
    },
  };
}
