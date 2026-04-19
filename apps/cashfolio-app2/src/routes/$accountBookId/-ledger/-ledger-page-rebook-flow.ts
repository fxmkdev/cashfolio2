import { useMemo } from "react";
import type { AccountOption } from "../../../components/edit-transaction-modal";
import {
  getBookingUnitIdentifier,
  isBookingUnitCompatibleWithAccount,
  isBookingValueCompatibleWithAccountType,
} from "../../../shared/account-utils";
import type { LedgerAccountOptionSource } from "./-ledger-page-types";
import type { RebookingState } from "./-ledger-page-view";

export function useLedgerRebookFlow(args: {
  rebooking: RebookingState | undefined;
  currentAccountId: string;
  accounts: LedgerAccountOptionSource[];
  accountOptions: AccountOption[];
}) {
  const hasCompleteBookingUnit = useMemo(() => {
    if (!args.rebooking || args.rebooking.bookingUnit.unit == null)
      return false;

    const bookingUnitIdentifier = getBookingUnitIdentifier({
      unit: args.rebooking.bookingUnit.unit,
      currency: args.rebooking.bookingUnit.currency,
      cryptocurrency: args.rebooking.bookingUnit.cryptocurrency,
      symbol: args.rebooking.bookingUnit.symbol,
      tradeCurrency: args.rebooking.bookingUnit.tradeCurrency,
    });

    return bookingUnitIdentifier != null;
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
      unit: rebooking.bookingUnit.unit!,
    };

    const eligibleAccountIds = new Set(
      args.accounts
        .filter(
          (candidate) =>
            candidate.isActive &&
            candidate.id !== args.currentAccountId &&
            isBookingUnitCompatibleWithAccount(bookingUnit, candidate) &&
            isBookingValueCompatibleWithAccountType(
              rebooking.bookingValue,
              candidate,
            ),
        )
        .map((candidate) => candidate.id),
    );

    return args.accountOptions
      .filter((option) => eligibleAccountIds.has(option.value))
      .toSorted((a, b) => a.label.localeCompare(b.label))
      .map((option) => ({ value: option.value, label: option.label }));
  }, [
    args.accountOptions,
    args.accounts,
    args.currentAccountId,
    args.rebooking,
    hasCompleteBookingUnit,
  ]);

  return {
    hasCompleteBookingUnit,
    rebookTargetAccountOptions,
  };
}
