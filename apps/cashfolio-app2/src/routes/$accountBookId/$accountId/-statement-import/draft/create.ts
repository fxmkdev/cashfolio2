import { createId } from "@paralleldrive/cuid2";
import { Unit } from "@/.prisma-client/enums";
import { getBookingUnitFields } from "@/shared/booking-unit-fields";
import { parseUtcDayDate } from "@/shared/date";
import type {
  CurrentAccountForStatementImport,
  StatementImportCsvRow,
  StatementImportDraft,
} from "../types";

export function createStatementImportDraft(args: {
  row: StatementImportCsvRow;
  sourceRowNumber: number;
  currentAccount: CurrentAccountForStatementImport;
}): StatementImportDraft {
  const date = parseUtcDayDate(args.row.date.trim());
  if (!date) {
    throw new Error("Date must be a valid UTC day.");
  }

  const amount = Number(args.row.amount.trim());
  const originalAmount = parseOptionalStrictNumber(args.row["original amount"]);
  const originalCurrency =
    args.row["original currency"].trim() === ""
      ? undefined
      : args.row["original currency"].trim();
  const currentUnitFields = getBookingUnitFields(
    args.currentAccount,
    "current account",
  );
  const currentValue = amount;
  const isoDate = date.toISOString();
  const description = args.row.description;
  const counterUnitFields =
    originalAmount != null && originalCurrency
      ? {
          unit: Unit.CURRENCY,
          currency: originalCurrency,
        }
      : currentUnitFields;
  const counterValue =
    originalAmount != null && originalCurrency
      ? -Math.sign(amount) * Math.abs(originalAmount)
      : -amount;

  return {
    id: createId(),
    sourceRowNumber: args.sourceRowNumber,
    currentAccountId: args.currentAccount.id,
    ignored: false,
    date: isoDate,
    amount,
    originalAmount,
    originalCurrency,
    counterAccountId: "",
    description,
    transaction: {
      description,
      bookings: [
        {
          date: isoDate,
          accountId: args.currentAccount.id,
          description: "",
          ...currentUnitFields,
          value: currentValue,
        },
        {
          date: isoDate,
          accountId: "",
          description: "",
          ...counterUnitFields,
          value: counterValue,
        },
      ],
    },
  };
}

function parseOptionalStrictNumber(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : Number(trimmed);
}
