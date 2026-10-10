import type { BookingUnitFieldsSource } from "@/shared/booking-unit-fields";
import type { StatementImportCsvHeader } from "@/shared/statement-import-csv-format";
import type { TransactionMutationValues } from "./-page-view";

export type StatementImportCsvRow = Record<StatementImportCsvHeader, string>;

export type CurrentAccountForStatementImport = {
  id: string;
} & BookingUnitFieldsSource;

export type StatementImportDraft = {
  id: string;
  sourceRowNumber: number;
  currentAccountId: string;
  ignored: boolean;
  matchedExistingBooking?: { id: string; transactionId: string };
  date: string;
  amount: number;
  originalAmount: number | undefined;
  originalCurrency: string | undefined;
  counterAccountId: string;
  description: string;
  transaction: TransactionMutationValues;
};

export type StatementImportDraftStatus =
  | {
      kind: "ignored";
      label: "Ignored" | "Already exists";
      color: "gray";
      message: string;
    }
  | {
      kind: "ready";
      label: "Ready";
      color: "green";
      message: null;
    }
  | {
      kind: "needs-edit";
      label: "Needs edit";
      color: "yellow";
      message: string;
    }
  | {
      kind: "error";
      label: "Error";
      color: "red";
      message: string;
    };

export type StatementImportParseResult = {
  drafts: StatementImportDraft[];
  errors: string[];
};
