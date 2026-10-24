import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../.prisma-client/enums";
import type { ExistingNode } from "../account-editor/account-cash-form-rules";
import type { AccountGroupInitialValues } from "../account-editor/edit-account-group-modal";
import type { AccountInitialValues } from "../account-editor/edit-account-modal";
import type { AccountOption } from "@/shared/account-options";
import type { ReorderGroupChildRow } from "../account-tree/reorder-group-children-modal";

export const accountGroupOptions = [
  {
    value: "group-assets",
    label: "Assets",
    type: AccountType.BALANCE,
    equityAccountSubtype: null,
    isCashAccount: false,
    parentGroupId: null,
    treePath: [],
    treeLabel: "Assets",
  },
  {
    value: "group-cash",
    label: "Assets / Cash",
    type: AccountType.BALANCE,
    equityAccountSubtype: null,
    isCashAccount: true,
    parentGroupId: "group-assets",
    treePath: ["Assets"],
    treeLabel: "Cash",
  },
  {
    value: "group-liabilities",
    label: "Liabilities",
    type: AccountType.BALANCE,
    equityAccountSubtype: null,
    isCashAccount: false,
    parentGroupId: null,
    treePath: [],
    treeLabel: "Liabilities",
  },
  {
    value: "group-income",
    label: "Income",
    type: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.INCOME,
    isCashAccount: false,
    parentGroupId: null,
    treePath: [],
    treeLabel: "Income",
  },
  {
    value: "group-expense",
    label: "Expense",
    type: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.EXPENSE,
    isCashAccount: false,
    parentGroupId: null,
    treePath: [],
    treeLabel: "Expense",
  },
];

export const existingNodes: ExistingNode[] = [
  {
    id: "group-assets",
    name: "Assets",
    nodeType: "accountGroup",
    type: AccountType.BALANCE,
  },
  {
    id: "group-cash",
    name: "Cash",
    nodeType: "accountGroup",
    parentId: "group-assets",
    type: AccountType.BALANCE,
  },
  {
    id: "account-checking",
    name: "Checking",
    nodeType: "account",
    groupId: "group-cash",
    type: AccountType.BALANCE,
    unit: Unit.CURRENCY,
  },
  {
    id: "account-savings",
    name: "Savings",
    nodeType: "account",
    groupId: "group-assets",
    type: AccountType.BALANCE,
    unit: Unit.CURRENCY,
  },
  {
    id: "group-income",
    name: "Income",
    nodeType: "accountGroup",
    type: AccountType.EQUITY,
  },
];

export const editAccountInitialValues: AccountInitialValues = {
  name: "Checking",
  type: AccountType.BALANCE,
  groupId: "group-cash",
  sortOrder: 10,
  unit: Unit.CURRENCY,
  currency: "CHF",
};

export const editAccountGroupInitialValues: AccountGroupInitialValues = {
  name: "Cash",
  type: AccountType.BALANCE,
  parentGroupId: "group-assets",
  sortOrder: 20,
  isCashAccount: false,
};

export const accountOptions: AccountOption[] = [
  {
    value: "account-checking",
    label: "Checking (CHF)",
    type: AccountType.BALANCE,
    unit: Unit.CURRENCY,
    currency: "CHF",
  },
  {
    value: "account-savings",
    label: "Savings (CHF)",
    type: AccountType.BALANCE,
    unit: Unit.CURRENCY,
    currency: "CHF",
  },
  {
    value: "account-credit-card",
    label: "Credit Card (CHF)",
    type: AccountType.BALANCE,
    unit: Unit.CURRENCY,
    currency: "CHF",
  },
  {
    value: "account-salary",
    label: "Salary (Income)",
    type: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.INCOME,
    unit: Unit.CURRENCY,
    currency: "CHF",
  },
  {
    value: "account-groceries",
    label: "Groceries (Expense)",
    type: AccountType.EQUITY,
    equityAccountSubtype: EquityAccountSubtype.EXPENSE,
    unit: Unit.CURRENCY,
    currency: "CHF",
  },
];

export const editTransactionInitialValues = {
  description: "Grocery shopping",
  bookings: [
    {
      date: "2026-01-15",
      account: "account-groceries",
      description: "Groceries",
      unit: Unit.CURRENCY,
      currency: "CHF",
      debit: 84.5,
    },
    {
      date: "2026-01-15",
      account: "account-checking",
      description: "Card payment",
      unit: Unit.CURRENCY,
      currency: "CHF",
      credit: 84.5,
    },
  ],
};

export const reorderRows: ReorderGroupChildRow[] = [
  { id: "group-cash", name: "Cash", nodeType: "accountGroup" },
  { id: "account-checking", name: "Checking", nodeType: "account" },
  { id: "account-savings", name: "Savings", nodeType: "account" },
];
