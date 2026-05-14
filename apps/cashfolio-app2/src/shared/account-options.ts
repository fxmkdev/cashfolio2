import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import type { AccountOption } from "@/components/edit-transaction-modal";
import { getTypeLabel } from "./account-utils";

export type AccountOptionSource = {
  id: string;
  name: string;
  groupPath: string;
  groupPathSegments: string[];
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
};

function toAccountOption(account: AccountOptionSource): AccountOption {
  const typeLabel = getTypeLabel(account.type, account.equityAccountSubtype);

  return {
    label: [typeLabel, account.groupPath, account.name]
      .filter(Boolean)
      .join(" / "),
    value: account.id,
    treePath: [typeLabel, ...account.groupPathSegments],
    treeLabel: account.name,
    unit: account.unit,
    currency: account.currency,
    cryptocurrency: account.cryptocurrency,
    symbol: account.symbol,
    tradeCurrency: account.tradeCurrency,
    type: account.type as AccountType,
    equityAccountSubtype:
      account.equityAccountSubtype as EquityAccountSubtype | null,
  };
}

export function createAccountOptions<Account extends AccountOptionSource>(
  accounts: Account[],
  includeAccount: (account: Account) => boolean,
): AccountOption[] {
  return accounts.filter(includeAccount).map(toAccountOption);
}
