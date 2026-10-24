import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import { getTypeLabel } from "./account-utils";

export type AccountOption = {
  label: string;
  value: string;
  treePath?: string[];
  unit: Unit | null;
  currency?: string | null;
  cryptocurrency?: string | null;
  symbol?: string | null;
  tradeCurrency?: string | null;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype | null;
};

export type AccountOptionSource = {
  id: string;
  name: string;
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
  const typeLabel =
    account.type === AccountType.EQUITY
      ? getTypeLabel(account.type, account.equityAccountSubtype)
      : "Accounts";

  return {
    label: account.name,
    value: account.id,
    treePath: [typeLabel, ...account.groupPathSegments],
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
