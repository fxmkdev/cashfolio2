import type { AccountOrganizeScope } from "../../../shared/account-organize/scope";
import {
  assertRecord,
  requireArrayField,
  requireEnumField,
  requireStringField,
} from "../../input-validation";
import type {
  OrganizeMove,
  OrganizeNodeRef,
} from "../../../shared/account-organize/types";

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

export function validateAccountTreeBatch(data: unknown) {
  assertRecord(data);
  const items = Array.from(requireArrayField(data, "items"), readRef);
  if (!items.length) throw new Error("Select at least one account or group.");
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new Error("Select each account or group only once.");
  return { accountBookId: requireStringField(data, "accountBookId"), items };
}

export function validateOrganizeBook(data: unknown) {
  assertRecord(data);
  return {
    accountBookId: requireStringField(data, "accountBookId"),
    ...(data.scope === undefined
      ? {}
      : {
          scope: requireEnumField(data, "scope", [
            "balance",
            "income",
            "expense",
          ] as const),
        }),
  };
}

function readParent(data: Record<string, unknown>) {
  return data.parentId === null ? null : requireStringField(data, "parentId");
}

export function validateOrganizeMove(data: unknown): OrganizeMove & {
  accountBookId: string;
  version: string;
  scope?: AccountOrganizeScope;
} {
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
