import { AccountType } from "@/.prisma-client/enums";
import type { StatementImportExistingBooking } from "@/server/statement-import";
import { getUnitIdentifier } from "@/shared/account-utils";
import type { BookingUnitFieldsSource } from "@/shared/booking-unit-fields";
import { getBookingUnitFields } from "@/shared/booking-unit-fields";
import { formatUtcDate } from "@/shared/date";
import { moneyAdd, moneyIsZero, toMoney, toMoneyNumber } from "@/shared/money";
import type { MoneyInput } from "@/shared/money";
import type { StatementImportDraft } from "./-statement-import-types";

export const STATEMENT_IMPORT_BALANCE_CARRIED_FORWARD_ROW_ID =
  "__statement_import_balance_carried_forward__";

export type StatementImportReviewDraftRow = StatementImportDraft & {
  rowType: "draft";
  balance: number;
};

type StatementImportReadOnlyFields = {
  ignored?: false;
  originalAmount?: undefined;
  originalCurrency?: undefined;
  counterAccountId?: undefined;
};

export type StatementImportExistingBookingRow =
  StatementImportReadOnlyFields & {
    id: string;
    rowType: "existingBooking";
    date: string;
    amount: number;
    description: string;
    balance: number;
  };

export type StatementImportBalanceCarriedForwardRow =
  StatementImportReadOnlyFields & {
    id: typeof STATEMENT_IMPORT_BALANCE_CARRIED_FORWARD_ROW_ID;
    rowType: "balanceCarriedForward";
    date?: undefined;
    amount?: undefined;
    description: "Balance carried forward";
    balance: number;
  };

export type StatementImportGridRow =
  | StatementImportReviewDraftRow
  | StatementImportExistingBookingRow
  | StatementImportBalanceCarriedForwardRow;

type BalanceArgs = {
  account: { type: AccountType } & BookingUnitFieldsSource;
  existingBookings: StatementImportExistingBooking[];
  drafts: StatementImportDraft[];
};

type BalanceEvent = {
  date: string;
  // Existing unmatched bookings precede the bottom-to-top CSV sequence.
  draftOrder: number;
  bookingOrder: number;
  value: MoneyInput;
  row?: StatementImportReviewDraftRow | StatementImportExistingBookingRow;
};

export function isStatementImportReviewDraftRow(
  row: StatementImportGridRow | undefined,
): row is StatementImportReviewDraftRow {
  return row?.rowType === "draft";
}

export function getStatementImportGridRows(
  args: BalanceArgs,
): StatementImportGridRow[] {
  if (args.drafts.length === 0) return [];

  const draftDates = args.drafts
    .map((draft) => formatUtcDate(new Date(draft.date)))
    .sort();
  const firstDate = draftDates[0];
  const lastDate = draftDates[draftDates.length - 1];
  const accountUnit = getUnitIdentifier(getBookingUnitFields(args.account));
  const matchedOrder = new Map<string, number>();
  args.drafts.forEach((draft, index) => {
    if (draft.matchedExistingBooking) {
      matchedOrder.set(
        draft.matchedExistingBooking.id,
        args.drafts.length - index,
      );
    }
  });

  const events: BalanceEvent[] = [...args.existingBookings]
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.id.localeCompare(right.id),
    )
    .map((booking, index) => {
      const order = matchedOrder.get(booking.id);
      return {
        date: booking.date,
        draftOrder: order ?? 0,
        bookingOrder: order === undefined ? index : 0,
        value: booking.amount,
        row:
          order === undefined &&
          booking.date >= firstDate &&
          booking.date <= lastDate
            ? {
                id: `__statement_import_existing_booking__${booking.id}`,
                rowType: "existingBooking",
                date: booking.date,
                amount: toMoneyNumber(booking.amount),
                description: booking.description,
                balance: 0,
              }
            : undefined,
      };
    });

  args.drafts.forEach((draft, index) => {
    const draftOrder = args.drafts.length - index;
    if (!draft.ignored) {
      draft.transaction.bookings.forEach((booking, bookingIndex) => {
        if (
          booking.accountId !== draft.currentAccountId ||
          getUnitIdentifier(booking) !== accountUnit
        )
          return;

        events.push({
          date: formatUtcDate(new Date(booking.date)),
          draftOrder,
          bookingOrder: bookingIndex + 1,
          value: booking.value,
        });
      });
    }
    // A row is a balance marker even when it contributes no new booking.
    events.push({
      date: formatUtcDate(new Date(draft.date)),
      draftOrder,
      bookingOrder: Number.POSITIVE_INFINITY,
      value: 0,
      row: { ...draft, rowType: "draft", balance: 0 },
    });
  });

  events.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.draftOrder - right.draftOrder ||
      left.bookingOrder - right.bookingOrder,
  );

  const negate = args.account.type === AccountType.LIABILITY;
  const displayBalance = (value: MoneyInput) =>
    toMoneyNumber(negate ? toMoney(value).neg() : value);
  let runningBalance = toMoney(0);
  let balanceBeforeReview = toMoney(0);
  const rows: StatementImportGridRow[] = [];
  for (const event of events) {
    runningBalance = moneyAdd(runningBalance, event.value);
    if (event.date < firstDate) balanceBeforeReview = runningBalance;
    if (event.row) {
      rows.push({ ...event.row, balance: displayBalance(runningBalance) });
    }
  }

  rows.reverse();
  if (!moneyIsZero(balanceBeforeReview)) {
    rows.push({
      id: STATEMENT_IMPORT_BALANCE_CARRIED_FORWARD_ROW_ID,
      rowType: "balanceCarriedForward",
      description: "Balance carried forward",
      balance: displayBalance(balanceBeforeReview),
    });
  }
  return rows;
}

export function getStatementImportReviewRows(
  args: BalanceArgs,
): StatementImportReviewDraftRow[] {
  return getStatementImportGridRows(args).filter(
    isStatementImportReviewDraftRow,
  );
}

export function getStatementImportBalanceCarriedForwardRow(
  args: BalanceArgs,
): StatementImportBalanceCarriedForwardRow | undefined {
  return getStatementImportGridRows(args).find(
    (row): row is StatementImportBalanceCarriedForwardRow =>
      row.rowType === "balanceCarriedForward",
  );
}
