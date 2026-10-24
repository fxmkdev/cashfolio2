import type {
  AccountType,
  EquityAccountSubtype,
} from "../.prisma-client/enums";

/** BALANCE is a query/presentation scope, never a persisted account type. */
export type AccountTypeScope = AccountType | "BALANCE";
export type TabValue =
  "BALANCE" | "ASSET" | "LIABILITY" | `EQUITY-${EquityAccountSubtype}`;

export function getPersistedAccountTypeFilter(type?: AccountTypeScope) {
  return type === "BALANCE"
    ? { in: ["ASSET", "LIABILITY"] as AccountType[] }
    : type;
}
