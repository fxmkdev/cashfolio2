import { type AccountInput } from "../accounts-types";
import { Prisma } from "../../../.prisma-client/client";
import { AccountType } from "../../../.prisma-client/enums";
import {
  resolveAccountCashFlag,
  normalizeMissingCashAccountFlag,
} from "../accounts-cash-rules";
import { assertNoSystemManagedAccountSubtype } from "../accounts-system-managed-equity-guards";
import { validateAccountInput } from "../../../shared/account-validation";
import { applyOpeningBalanceTarget } from "./opening-balances";
import { type AccountUpdateInput } from "./types";

type ExistingAccountUnitIdentity = {
  unit: AccountInput["unit"] | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
};

type ExistingAccountStatementImportConfig = {
  statementImportCsvFormat: Prisma.JsonValue | null;
};

function normalizeSubmittedUnitField(value: string | null | undefined) {
  return value ?? null;
}

function assertAccountUnitIdentityUnchanged(
  data: AccountInput,
  existing: ExistingAccountUnitIdentity,
) {
  if (data.unit !== undefined && (data.unit ?? null) !== existing.unit) {
    throw new Error("Account unit cannot be changed");
  }

  if (
    data.currency !== undefined &&
    normalizeSubmittedUnitField(data.currency) !== existing.currency
  ) {
    throw new Error("Account unit cannot be changed");
  }

  if (
    data.cryptocurrency !== undefined &&
    normalizeSubmittedUnitField(data.cryptocurrency) !== existing.cryptocurrency
  ) {
    throw new Error("Account unit cannot be changed");
  }

  if (
    data.symbol !== undefined &&
    normalizeSubmittedUnitField(data.symbol) !== existing.symbol
  ) {
    throw new Error("Account unit cannot be changed");
  }

  if (
    data.tradeCurrency !== undefined &&
    normalizeSubmittedUnitField(data.tradeCurrency) !== existing.tradeCurrency
  ) {
    throw new Error("Account unit cannot be changed");
  }
}

function mergeExistingAccountUnitIdentity<T extends AccountInput>(
  data: T,
  existing: ExistingAccountUnitIdentity,
): T {
  return {
    ...data,
    unit: existing.unit ?? undefined,
    currency: existing.currency ?? undefined,
    cryptocurrency: existing.cryptocurrency ?? undefined,
    symbol: existing.symbol ?? undefined,
    tradeCurrency: existing.tradeCurrency ?? undefined,
  };
}

function normalizeEquityAccountUnitIdentity<T extends AccountInput>(
  data: T,
): T {
  if (data.type !== AccountType.EQUITY) {
    return data;
  }

  return {
    ...data,
    unit: undefined,
    currency: undefined,
    cryptocurrency: undefined,
    symbol: undefined,
    tradeCurrency: undefined,
  };
}

function toStatementImportCsvFormatJsonInput(
  format: AccountInput["statementImportCsvFormat"],
) {
  return format == null ? Prisma.DbNull : (format as Prisma.InputJsonValue);
}

function getStatementImportCsvFormatUpdateInput(
  data: AccountInput,
  existing: ExistingAccountStatementImportConfig,
) {
  return data.statementImportCsvFormat === undefined
    ? (existing.statementImportCsvFormat as AccountInput["statementImportCsvFormat"])
    : data.statementImportCsvFormat;
}

export async function createAccountOperation(
  data: AccountInput,
  tx: Prisma.TransactionClient,
) {
  const normalizedData = await resolveAccountCashFlag(
    normalizeMissingCashAccountFlag(normalizeEquityAccountUnitIdentity(data)),
    tx,
  );
  assertNoSystemManagedAccountSubtype(normalizedData);
  const siblingNames = (
    await tx.account.findMany({
      where: {
        groupId: normalizedData.groupId ?? null,
        accountBookId: normalizedData.accountBookId,
      },
      select: { name: true },
    })
  ).map((a) => a.name);
  validateAccountInput(normalizedData, siblingNames);
  const account = await tx.account.create({
    data: {
      name: normalizedData.name,
      type: normalizedData.type,
      equityAccountSubtype: normalizedData.equityAccountSubtype,
      groupId: normalizedData.groupId ?? null,
      sortOrder:
        typeof normalizedData.sortOrder === "number"
          ? normalizedData.sortOrder
          : null,
      unit: normalizedData.unit,
      currency: normalizedData.currency,
      cryptocurrency: normalizedData.cryptocurrency,
      symbol: normalizedData.symbol,
      tradeCurrency: normalizedData.tradeCurrency,
      statementImportCsvFormat: toStatementImportCsvFormatJsonInput(
        normalizedData.statementImportCsvFormat,
      ),
      isCashAccount: normalizedData.isCashAccount ?? false,
      accountBookId: normalizedData.accountBookId,
    },
  });

  await applyOpeningBalanceTarget({
    tx,
    accountBookId: normalizedData.accountBookId,
    account: {
      id: account.id,
      name: account.name,
      type: account.type,
      unit: account.unit,
      currency: account.currency,
      cryptocurrency: account.cryptocurrency,
      symbol: account.symbol,
      tradeCurrency: account.tradeCurrency,
    },
    openingBalance: normalizedData.openingBalance,
  });
  return { data: account, invalidatePeriodCache: true };
}

export async function updateAccountOperation(
  data: AccountUpdateInput,
  tx: Prisma.TransactionClient,
) {
  const submittedData = normalizeEquityAccountUnitIdentity(data);
  const existing = await tx.account.findUniqueOrThrow({
    where: {
      id_accountBookId: {
        id: submittedData.id,
        accountBookId: submittedData.accountBookId,
      },
    },
    select: {
      type: true,
      equityAccountSubtype: true,
      unit: true,
      currency: true,
      cryptocurrency: true,
      symbol: true,
      tradeCurrency: true,
      statementImportCsvFormat: true,
      isCashAccount: true,
    },
  });
  assertNoSystemManagedAccountSubtype(existing);
  if (
    submittedData.type !== existing.type ||
    submittedData.equityAccountSubtype !==
      (existing.equityAccountSubtype ?? undefined)
  ) {
    throw new Error("Account type cannot be changed");
  }
  assertAccountUnitIdentityUnchanged(submittedData, existing);
  const submittedDataWithExistingCashFlag = {
    ...submittedData,
    isCashAccount: submittedData.isCashAccount ?? existing.isCashAccount,
  };
  const normalizedData = await resolveAccountCashFlag(
    mergeExistingAccountUnitIdentity(
      submittedDataWithExistingCashFlag,
      existing,
    ),
    tx,
  );
  const dataWithExistingUnitIdentity = mergeExistingAccountUnitIdentity(
    normalizedData,
    existing,
  );

  const siblingNames = (
    await tx.account.findMany({
      where: {
        groupId: normalizedData.groupId ?? null,
        accountBookId: normalizedData.accountBookId,
        id: { not: normalizedData.id },
      },
      select: { name: true },
    })
  ).map((a) => a.name);
  validateAccountInput(dataWithExistingUnitIdentity, siblingNames);
  const account = await tx.account.update({
    where: {
      id_accountBookId: {
        id: normalizedData.id,
        accountBookId: normalizedData.accountBookId,
      },
    },
    data: {
      name: normalizedData.name,
      groupId: normalizedData.groupId ?? null,
      sortOrder:
        typeof normalizedData.sortOrder === "number"
          ? normalizedData.sortOrder
          : null,
      statementImportCsvFormat: toStatementImportCsvFormatJsonInput(
        getStatementImportCsvFormatUpdateInput(normalizedData, existing),
      ),
      isCashAccount: normalizedData.isCashAccount ?? false,
    },
  });

  await applyOpeningBalanceTarget({
    tx,
    accountBookId: normalizedData.accountBookId,
    account: {
      id: account.id,
      name: account.name,
      type: account.type,
      unit: account.unit,
      currency: account.currency,
      cryptocurrency: account.cryptocurrency,
      symbol: account.symbol,
      tradeCurrency: account.tradeCurrency,
    },
    openingBalance: normalizedData.openingBalance,
  });
  return { data: account, invalidatePeriodCache: true };
}
