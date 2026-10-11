import {
  AccountType,
  type EquityAccountSubtype,
  Unit,
} from "@/.prisma-client/enums";
import {
  getSimpleTransactionUnitIdentifier,
  isOpeningBalancesAccount,
} from "@/shared/account-utils";
import type { StatementImportCsvFormat } from "@/shared/statement-import-csv-format";

export function getStatementImportDisabledReason(account: {
  type: AccountType;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  statementImportCsvFormat?: StatementImportCsvFormat | null;
}): string | null {
  if (
    account.type !== AccountType.ASSET &&
    account.type !== AccountType.LIABILITY
  ) {
    return "Statement imports are only available for asset and liability accounts.";
  }

  if (!getSimpleTransactionUnitIdentifier(account)) {
    return "Statement imports require a current account with a complete unit.";
  }

  if (!account.statementImportCsvFormat) {
    return "Statement imports require a CSV format configured on this account.";
  }

  return null;
}

export function shouldIncludeStatementImportAccountOption(
  account: {
    id: string;
    isActive: boolean;
    type: AccountType;
    equityAccountSubtype?: EquityAccountSubtype | null;
  },
  currentAccountId: string,
): boolean {
  return (
    !isOpeningBalancesAccount(account) &&
    (account.isActive || account.id === currentAccountId)
  );
}
