import type { HistoryScopeOption } from "@/shared/history-scope";

export const netWorthScopeOptions: HistoryScopeOption[] = [
  {
    value: "group:banking",
    label: "Banking",
    treeLabel: "Banking",
    kind: "group",
  },
  {
    value: "group:cash",
    label: "Banking / Cash",
    treeLabel: "Cash",
    kind: "group",
    parentValue: "group:banking",
  },
  {
    value: "account:checking",
    label: "Banking / Cash / Checking",
    treeLabel: "Checking",
    kind: "account",
    parentValue: "group:cash",
  },
  {
    value: "account:card",
    label: "Banking / Credit Card",
    treeLabel: "Credit Card",
    kind: "account",
    parentValue: "group:banking",
  },
  {
    value: "account:archived",
    label: "Banking / Old Savings",
    treeLabel: "Old Savings",
    kind: "account",
    parentValue: "group:banking",
  },
  {
    value: "group:empty",
    label: "Empty Group",
    treeLabel: "Empty Group",
    kind: "group",
  },
  {
    value: "account:zero",
    label: "Wallet",
    treeLabel: "Wallet",
    kind: "account",
  },
];
