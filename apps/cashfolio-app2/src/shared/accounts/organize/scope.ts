export type AccountOrganizeScope = "balance" | "income" | "expense";

export function accountOrganizeFilter(scope: AccountOrganizeScope = "balance") {
  return scope === "balance"
    ? { type: "BALANCE" as const }
    : {
        type: "EQUITY" as const,
        equityAccountSubtype:
          scope === "income" ? ("INCOME" as const) : ("EXPENSE" as const),
      };
}
