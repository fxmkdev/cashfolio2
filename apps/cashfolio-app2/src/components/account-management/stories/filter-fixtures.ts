import { AccountType } from "@/.prisma-client/enums";
import { createAccountRow, createGroupRow } from "./fixtures";
import type { TreeRow } from "../page-types";

const group = (id: string, name: string, parentId?: string) =>
  createGroupRow({
    id,
    name,
    parentId,
    isActive: true,
    type: AccountType.BALANCE,
    sortOrder: 0,
  });
const account = (
  id: string,
  currency: string,
  assetClassId: string | null,
  groupId?: string,
): TreeRow => ({
  ...createAccountRow({
    id,
    name: id,
    currency,
    groupId,
    isActive: true,
    type: AccountType.BALANCE,
    sortOrder: 0,
    balance: 10,
    balanceInReferenceCurrency: 10,
  }),
  assetClassId,
  trackingMethod: "INDIVIDUAL_UNITS",
});

export const filterRows: TreeRow[] = [
  group("portfolio", "Portfolio"),
  group("nested", "Nested", "portfolio"),
  group("empty", "Empty"),
  {
    ...account("direct-usd", "USD", "EQUITIES", "portfolio"),
    trackingMethod: "TOTAL_PORTFOLIO_VALUE",
  },
  account("child-chf", "CHF", "LISTED_EQUITIES", "nested"),
  {
    ...account("archived-eur", "EUR", "LISTED_EQUITIES", "nested"),
    isActive: false,
  },
  account("unclassified-chf", "CHF", null),
  account("outside-usd", "USD", "FIXED_INCOME"),
];
