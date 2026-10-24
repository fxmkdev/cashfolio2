import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import { isSystemManagedEquitySubtype } from "./system-managed-equity-subtypes";
import type { TabValue } from "./account-tabs";

type AccountClassification = {
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype | null;
};

export type AccountManagementContext = "accounts" | "categories";

export function isBalanceAccount(account: AccountClassification): boolean {
  return (
    account.type === AccountType.ASSET || account.type === AccountType.LIABILITY
  );
}

export function isAccountGroupCompatible(
  account: AccountClassification,
  group: { type: string; equityAccountSubtype?: string | null },
): boolean {
  if (isBalanceAccount(account)) {
    return (
      group.type === AccountType.ASSET || group.type === AccountType.LIABILITY
    );
  }
  return (
    group.type === AccountType.EQUITY &&
    (!group.equityAccountSubtype ||
      group.equityAccountSubtype === account.equityAccountSubtype)
  );
}

export function isCategoryAccount(account: AccountClassification): boolean {
  return (
    account.type === AccountType.EQUITY &&
    (account.equityAccountSubtype === EquityAccountSubtype.INCOME ||
      account.equityAccountSubtype === EquityAccountSubtype.EXPENSE ||
      account.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS)
  );
}

export function isSystemManagedAccount(
  account: AccountClassification,
): boolean {
  return (
    account.type === AccountType.EQUITY &&
    isSystemManagedEquitySubtype(account.equityAccountSubtype)
  );
}

export function getAccountEntityLabel(
  account: AccountClassification,
): "Account" | "Category" {
  return isCategoryAccount(account) ? "Category" : "Account";
}

export function getAccountManagementPath(context: AccountManagementContext) {
  return context === "categories"
    ? ("/$accountBookId/settings/categories" as const)
    : ("/$accountBookId/accounts" as const);
}

export function getAccountManagementContext(
  account: AccountClassification,
): AccountManagementContext {
  return isCategoryAccount(account) ? "categories" : "accounts";
}

export function getAccountManagementDestination(
  account: AccountClassification & { isActive: boolean },
  tab: TabValue,
) {
  if (isCategoryAccount(account)) {
    return {
      to: "/$accountBookId/settings/categories" as const,
      search: { tab, showArchived: !account.isActive },
    };
  }
  return {
    to: "/$accountBookId/accounts" as const,
    search: {
      tab,
      mode: account.isActive ? ("active" as const) : ("archived" as const),
    },
  };
}

/** Translate existing constraint messages at the presentation boundary only. */
export function getAccountConstraintMessage(
  message: string | null | undefined,
  context: AccountManagementContext,
): string | undefined {
  if (message == null) return undefined;
  if (context === "accounts") return message;
  return message
    .replace(/\bAn account(?! book)\b/g, "A category")
    .replace(
      /(?<!category )\b(account groups?|accounts?(?! book)|groups?)\b/gi,
      (word) => {
        const replacement = word.toLowerCase().includes("group")
          ? word.toLowerCase().endsWith("groups")
            ? "category groups"
            : "category group"
          : word.toLowerCase() === "accounts"
            ? "categories"
            : "category";
        return word[0] === word[0].toUpperCase()
          ? replacement[0].toUpperCase() + replacement.slice(1)
          : replacement;
      },
    );
}
