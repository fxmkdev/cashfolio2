import { prisma } from "../../../prisma.server";
import type { Unit } from "../../../.prisma-client/enums";
import {
  assetClassSelection,
  withAssetClassId,
} from "../../classification-data";
import { toNumericMoney } from "../../money-boundary";
import { toMoney, moneyIsZero } from "../../../shared/money";
import { isBalanceAccount } from "../../../shared/accounts/account-presentation";
import type { AccountTreeRow } from "../../../shared/accounts/account-tree";
import type { StatementImportCsvFormat } from "../../../shared/statement-import-csv-format";
import {
  getGroupHierarchy,
  hasInactiveAncestorGroup,
} from "../hierarchy/groups.server";
import {
  addUtcDays,
  getOpeningBalancesBookingDate,
  getUtcDayRange,
  startOfUtcDay,
} from "../../../shared/date";
import {
  accountTypeRequiresZeroBalanceForArchive,
  getAccountArchiveAvailability,
  getAccountDeleteAvailability,
  getAccountUnarchiveAvailability,
} from "../../../shared/accounts/account-tree-rules";
import type { LedgerAccountActionDataInput } from "./types";

export async function queryLedgerAccountActionData(
  data: LedgerAccountActionDataInput,
): Promise<AccountTreeRow> {
  const currentBalanceEndExclusive = addUtcDays(startOfUtcDay(new Date()), 1);
  const [
    account,
    accountBook,
    bookingAggregate,
    allScheduledBookingAggregate,
    bookingCount,
    groupById,
  ] = await Promise.all([
    prisma.account
      .findUnique({
        where: {
          id_accountBookId: {
            id: data.accountId,
            accountBookId: data.accountBookId,
          },
        },
        select: {
          id: true,
          name: true,
          type: true,
          equityAccountSubtype: true,
          unit: true,
          currency: true,
          cryptocurrency: true,
          symbol: true,
          tradeCurrency: true,
          statementImportCsvFormat: true,
          classifications: assetClassSelection,
          trackingMethod: true,

          isCashAccount: true,
          groupId: true,
          isActive: true,
          sortOrder: true,
        },
      })
      .then((account) =>
        account
          ? {
              ...withAssetClassId(account),
              statementImportCsvFormat:
                account.statementImportCsvFormat as StatementImportCsvFormat | null,
            }
          : null,
      ),
    prisma.accountBook.findUniqueOrThrow({
      where: { id: data.accountBookId },
      select: { startDate: true },
    }),
    prisma.booking.aggregate({
      where: {
        accountBookId: data.accountBookId,
        accountId: data.accountId,
        date: { lt: currentBalanceEndExclusive },
      },
      _sum: { value: true },
    }),
    prisma.booking.aggregate({
      where: {
        accountBookId: data.accountBookId,
        accountId: data.accountId,
      },
      _sum: { value: true },
    }),
    prisma.booking.count({
      where: {
        accountBookId: data.accountBookId,
        accountId: data.accountId,
      },
    }),
    getGroupHierarchy(data.accountBookId),
  ]);

  if (!account) {
    throw new Error(
      `Ledger account action data not found for accountId=${data.accountId}, accountBookId=${data.accountBookId}.`,
    );
  }

  const requiresZeroBalance = accountTypeRequiresZeroBalanceForArchive(
    account.type,
  );
  const rawBalance = toMoney(bookingAggregate._sum.value ?? toMoney(0));
  const hasZeroBalance =
    !requiresZeroBalance ||
    moneyIsZero(allScheduledBookingAggregate._sum.value ?? toMoney(0));
  const deleteAvailability = getAccountDeleteAvailability(bookingCount > 0);
  const archiveAvailability = getAccountArchiveAvailability({
    isActive: account.isActive,
    hasZeroBalance,
  });
  const unarchiveAvailability = getAccountUnarchiveAvailability({
    isActive: account.isActive,
    hasInactiveAncestor: hasInactiveAncestorGroup(account.groupId, groupById),
  });
  const openingBalanceRange = getUtcDayRange(
    getOpeningBalancesBookingDate(accountBook.startDate),
  );
  const openingBalanceAggregate = requiresZeroBalance
    ? await prisma.booking.aggregate({
        where: {
          accountBookId: data.accountBookId,
          accountId: data.accountId,
          date: {
            gte: openingBalanceRange.start,
            lt: openingBalanceRange.endExclusive,
          },
        },
        _sum: { value: true },
      })
    : null;
  const openingRawBalance =
    openingBalanceAggregate?._sum.value == null
      ? null
      : toMoney(openingBalanceAggregate._sum.value);

  return toNumericMoney({
    id: account.id,
    nodeType: "account",
    name: account.name,
    type: account.type,
    equityAccountSubtype: account.equityAccountSubtype,
    unit: account.unit as Unit | null,
    currency: account.currency as string | null,
    cryptocurrency: account.cryptocurrency as string | null,
    symbol: account.symbol as string | null,
    tradeCurrency: account.tradeCurrency as string | null,
    statementImportCsvFormat: account.statementImportCsvFormat,
    assetClassId: account.assetClassId,
    trackingMethod: account.trackingMethod,

    isCashAccount: account.isCashAccount,
    balance: isBalanceAccount(account) ? rawBalance : null,
    balanceInReferenceCurrency: null,
    openingBalance:
      openingRawBalance == null
        ? null
        : isBalanceAccount(account)
          ? openingRawBalance
          : null,
    parentId: account.groupId ?? undefined,
    isActive: account.isActive,
    groupId: account.groupId ?? undefined,
    sortOrder: account.sortOrder,
    deletable: deleteAvailability.enabled,
    deleteDisabledReason: deleteAvailability.disabledReason,
    archivable: archiveAvailability.enabled,
    archiveDisabledReason: archiveAvailability.disabledReason,
    unarchivable: unarchiveAvailability.enabled,
    unarchiveDisabledReason: unarchiveAvailability.disabledReason,
  });
}
