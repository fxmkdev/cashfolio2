export type BreakdownNodeKind = "group" | "account";

export type BreakdownHierarchyNode<Amount = number> = {
  id: string;
  label: string;
  kind: BreakdownNodeKind;
  amount: Amount;
  children: BreakdownHierarchyNode<Amount>[];
};
