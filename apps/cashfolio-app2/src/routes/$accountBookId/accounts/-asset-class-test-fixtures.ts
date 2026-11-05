import type { ClassificationNode } from "@/shared/asset-class";
import { assetClassRowId, unitRowId } from "./-asset-class-tree";
import type { TreeRow } from "./-page-types";

export const chfUnitId = (classId: string) =>
  unitRowId(assetClassRowId(classId), "CURRENCY:CHF");

export function account(id: string, overrides: Partial<TreeRow> = {}): TreeRow {
  return {
    id,
    name: id,
    nodeType: "account",
    type: "BALANCE",
    equityAccountSubtype: null,
    unit: "CURRENCY",
    currency: "CHF",
    cryptocurrency: null,
    symbol: null,
    tradeCurrency: null,
    balance: 10,
    balanceInReferenceCurrency: 10,
    openingBalance: null,
    parentId: "broker",
    groupId: "broker",
    sortOrder: 2,
    isActive: true,
    deletable: true,
    deleteDisabledReason: undefined,
    archivable: true,
    archiveDisabledReason: undefined,
    unarchivable: false,
    unarchiveDisabledReason: "Original constraint",
    assetClassId: "swiss",
    ...overrides,
  };
}

export const classes: ClassificationNode[] = [
  { id: "swiss", name: "Swiss", parentId: "equities", sortOrder: 0 },
  { id: "empty", name: "Empty", parentId: null, sortOrder: 0 },
  { id: "equities", name: "Equities", parentId: null, sortOrder: 2 },
  { id: "cash", name: "Cash", parentId: null, sortOrder: 1 },
];
