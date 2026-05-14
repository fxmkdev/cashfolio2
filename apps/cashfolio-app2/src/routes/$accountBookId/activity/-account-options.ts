import { useMemo } from "react";
import type { AccountOption } from "@/components/edit-transaction-modal";
import {
  getBookingUnitIdentifier,
  isBookingUnitCompatibleWithAccount,
  isBookingValueCompatibleWithAccountType,
  isOpeningBalancesAccount,
} from "@/shared/account-utils";
import { createAccountOptions } from "../$accountId/-page-data";
import type { RebookingState } from "./-page-view";
import type { ActivityAccountOptionSource } from "./-page-types";

type EditingTransactionData =
  | {
      bookings?: { account: string | null }[];
    }
  | undefined;

export function useActivityAccountOptions(args: {
  accounts: ActivityAccountOptionSource[];
  editingTransactionData: EditingTransactionData;
  rebooking: RebookingState | undefined;
}) {
  const activeAccountOptions = useMemo<AccountOption[]>(
    () =>
      createAccountOptions(
        args.accounts,
        (account) => account.isActive && !isOpeningBalancesAccount(account),
      ),
    [args.accounts],
  );

  const editAccountOptions = useMemo<AccountOption[]>(() => {
    if (!args.editingTransactionData) return activeAccountOptions;

    const selectedAccountIds = new Set(
      (args.editingTransactionData.bookings ?? [])
        .map((booking) => booking.account)
        .filter((id): id is string => Boolean(id)),
    );

    return createAccountOptions(
      args.accounts,
      (account) =>
        !isOpeningBalancesAccount(account) &&
        (account.isActive || selectedAccountIds.has(account.id)),
    );
  }, [activeAccountOptions, args.accounts, args.editingTransactionData]);

  const hasCompleteBookingUnit = useMemo(() => {
    if (!args.rebooking || args.rebooking.bookingUnit.unit == null) {
      return false;
    }

    return (
      getBookingUnitIdentifier({
        unit: args.rebooking.bookingUnit.unit,
        currency: args.rebooking.bookingUnit.currency,
        cryptocurrency: args.rebooking.bookingUnit.cryptocurrency,
        symbol: args.rebooking.bookingUnit.symbol,
        tradeCurrency: args.rebooking.bookingUnit.tradeCurrency,
      }) != null
    );
  }, [args.rebooking]);

  const rebookTargetAccountOptions = useMemo(() => {
    if (
      !args.rebooking ||
      args.rebooking.bookingUnit.unit == null ||
      !hasCompleteBookingUnit
    ) {
      return [];
    }

    const rebooking = args.rebooking;
    const bookingUnit = {
      ...rebooking.bookingUnit,
      unit: rebooking.bookingUnit.unit,
    } as {
      unit: NonNullable<RebookingState["bookingUnit"]["unit"]>;
      currency: string | null;
      cryptocurrency: string | null;
      symbol: string | null;
      tradeCurrency: string | null;
    };

    const eligibleAccountIds = new Set(
      args.accounts
        .filter(
          (candidate) =>
            candidate.isActive &&
            candidate.id !== rebooking.currentAccountId &&
            isBookingUnitCompatibleWithAccount(bookingUnit, candidate) &&
            isBookingValueCompatibleWithAccountType(
              rebooking.bookingValue,
              candidate,
            ),
        )
        .map((candidate) => candidate.id),
    );

    return activeAccountOptions
      .filter((option) => eligibleAccountIds.has(option.value))
      .toSorted((a, b) => a.label.localeCompare(b.label));
  }, [
    activeAccountOptions,
    args.accounts,
    args.rebooking,
    hasCompleteBookingUnit,
  ]);

  return {
    activeAccountOptions,
    editAccountOptions,
    hasCompleteBookingUnit,
    rebookTargetAccountOptions,
  };
}
