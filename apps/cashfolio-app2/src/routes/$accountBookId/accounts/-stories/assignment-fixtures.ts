import { AccountType, Unit } from "@/.prisma-client/enums";
import { type TreeRow } from "../-page-types";
import { createGroupRow, activeAssetRows } from "./fixtures";
export const bulkRows: TreeRow[] = [
  createGroupRow({
    id: "portfolio",
    name: "Portfolio",
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: 0,
  }),
  createGroupRow({
    id: "nested",
    name: "Nested",
    parentId: "portfolio",
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: 0,
  }),
  createGroupRow({
    id: "empty",
    name: "Empty",
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: 1,
  }),
  {
    ...activeAssetRows.find((row) => row.id === "account-checking")!,
    groupId: "portfolio",
    parentId: "portfolio",
    assetClassId: "FIXED_INCOME",
  },
  {
    ...activeAssetRows.find((row) => row.nodeType === "account")!,
    id: "old",
    name: "Old Holding",
    groupId: "nested",
    parentId: "nested",
    isActive: false,
    assetClassId: "DIGITAL_ASSETS",
  },
];

export const groupSelectionRows: TreeRow[] = [
  ...bulkRows,
  createGroupRow({
    id: "other-group",
    name: "Other Group",
    type: AccountType.BALANCE,
    isActive: true,
    sortOrder: 2,
  }),
  {
    ...bulkRows[3],
    id: "other",
    name: "Other Account",
    groupId: "other-group",
    parentId: "other-group",
  },
  createGroupRow({
    id: "closed",
    name: "Closed Group",
    type: AccountType.BALANCE,
    isActive: false,
    sortOrder: 3,
  }),
  {
    ...bulkRows[4],
    id: "closed-child",
    name: "Closed Account",
    groupId: "closed",
    parentId: "closed",
  },
];

export const trackingMethodRows: TreeRow[] = [
  ...bulkRows.map((row) =>
    row.id === "old" ? { ...row, unit: Unit.CURRENCY } : row,
  ),
  ...[Unit.SECURITY, Unit.CRYPTOCURRENCY].map((unit) => ({
    ...bulkRows.find((row) => row.id === "old")!,
    id: unit,
    name: unit === Unit.SECURITY ? "Security Holding" : "Crypto Holding",
    groupId: "portfolio",
    parentId: "portfolio",
    unit,
    isActive: true,
  })),
];
