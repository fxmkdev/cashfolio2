export type BreakdownNodeKind = "group" | "account";

export type BreakdownHierarchyNode = {
  id: string;
  label: string;
  kind: BreakdownNodeKind;
  amount: number;
  rawAmount?: number;
  children: BreakdownHierarchyNode[];
};
