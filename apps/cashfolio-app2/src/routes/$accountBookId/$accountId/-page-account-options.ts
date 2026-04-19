import { useMemo } from "react";
import { AccountType, Unit } from "../../../.prisma-client/enums";
import type { AccountOption } from "../../../components/edit-transaction-modal";
import { getSimpleTransactionUnitIdentifier } from "../../../shared/account-utils";
import {
  createAccountOptions,
  createCurrentAccountLabel,
  getSimpleTransactionDisabledReason,
  type SimpleTransactionEditInitialValues,
} from "./-page-data";
import type { LedgerAccount, LedgerAccountOptionSource } from "./-page-types";

type EditingTransactionData =
  | {
      bookings?: { account: string | null }[];
    }
  | undefined;

export function useLedgerAccountOptions(args: {
  account: LedgerAccount;
  accounts: LedgerAccountOptionSource[];
  editingTransactionData: EditingTransactionData;
  editingSimpleInitialValues: SimpleTransactionEditInitialValues | undefined;
}) {
  const allAccountOptions = useMemo<AccountOption[]>(
    () => createAccountOptions(args.accounts, () => true),
    [args.accounts],
  );

  const accountOptions = useMemo<AccountOption[]>(
    () => createAccountOptions(args.accounts, (a) => a.isActive),
    [args.accounts],
  );

  const editAccountOptions = useMemo<AccountOption[]>(() => {
    if (!args.editingTransactionData) return accountOptions;

    const selectedAccountIds = new Set([
      args.account.id,
      ...(args.editingTransactionData.bookings ?? [])
        .map((booking) => booking.account)
        .filter((id): id is string => Boolean(id)),
    ]);

    return createAccountOptions(
      args.accounts,
      (account) => account.isActive || selectedAccountIds.has(account.id),
    );
  }, [
    accountOptions,
    args.account.id,
    args.accounts,
    args.editingTransactionData,
  ]);

  const currentSimpleUnitIdentifier = useMemo(
    () => getSimpleTransactionUnitIdentifier(args.account),
    [args.account],
  );

  const simpleCounterAccountOptions = useMemo<AccountOption[]>(
    () =>
      createAccountOptions(
        args.accounts,
        (candidate) =>
          candidate.isActive &&
          candidate.id !== args.account.id &&
          (candidate.type === AccountType.EQUITY ||
            ((candidate.type === AccountType.ASSET ||
              candidate.type === AccountType.LIABILITY) &&
              currentSimpleUnitIdentifier !== null &&
              getSimpleTransactionUnitIdentifier({
                unit: candidate.unit,
                currency: candidate.currency,
                cryptocurrency: candidate.cryptocurrency,
                symbol: candidate.symbol,
                tradeCurrency: candidate.tradeCurrency,
              }) === currentSimpleUnitIdentifier)),
      ),
    [args.account.id, args.accounts, currentSimpleUnitIdentifier],
  );

  const currentAccountLabel = useMemo(
    () => createCurrentAccountLabel(args.account),
    [args.account],
  );

  const currentAccountOption = useMemo<AccountOption>(
    () => ({
      label: currentAccountLabel,
      value: args.account.id,
      unit: args.account.unit as Unit,
      currency: args.account.currency ?? undefined,
      cryptocurrency: args.account.cryptocurrency ?? undefined,
      symbol: args.account.symbol ?? undefined,
      tradeCurrency: args.account.tradeCurrency ?? undefined,
      type: args.account.type,
      equityAccountSubtype: args.account.equityAccountSubtype,
    }),
    [args.account, currentAccountLabel],
  );

  const editSimpleCounterAccountOptions = useMemo<AccountOption[]>(() => {
    if (!args.editingSimpleInitialValues) return simpleCounterAccountOptions;

    const selectedCounterAccountId =
      args.editingSimpleInitialValues.counterAccountId;
    if (
      simpleCounterAccountOptions.some(
        (option) => option.value === selectedCounterAccountId,
      )
    ) {
      return simpleCounterAccountOptions;
    }

    const selectedCounterAccount = allAccountOptions.find(
      (option) => option.value === selectedCounterAccountId,
    );
    if (!selectedCounterAccount) return simpleCounterAccountOptions;

    return [selectedCounterAccount, ...simpleCounterAccountOptions];
  }, [
    allAccountOptions,
    args.editingSimpleInitialValues,
    simpleCounterAccountOptions,
  ]);

  const simpleTransactionDisabledReason = getSimpleTransactionDisabledReason({
    account: args.account,
    currentSimpleUnitIdentifier,
    simpleCounterAccountOptionsLength: simpleCounterAccountOptions.length,
  });

  return {
    allAccountOptions,
    accountOptions,
    editAccountOptions,
    currentSimpleUnitIdentifier,
    simpleCounterAccountOptions,
    currentAccountLabel,
    currentAccountOption,
    editSimpleCounterAccountOptions,
    simpleTransactionDisabledReason,
  };
}
