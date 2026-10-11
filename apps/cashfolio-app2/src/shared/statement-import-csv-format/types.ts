export const STATEMENT_IMPORT_CSV_HEADERS = [
  "date",
  "amount",
  "original amount",
  "original currency",
  "exchange rate",
  "description",
] as const;

export type StatementImportCsvHeader =
  (typeof STATEMENT_IMPORT_CSV_HEADERS)[number];

export type StatementImportCsvColumnRef =
  number | { index: number } | { header: string };

export type StatementImportCsvDateFormat =
  "yyyy-MM-dd" | "dd.MM.yyyy" | "MM/dd/yyyy";

export type StatementImportCsvNumberFormat = {
  decimalSeparator: "." | ",";
  thousandsSeparator?: "." | "," | "'" | " ";
};

export type StatementImportCsvAmountMapping =
  | {
      mode: "signed";
      column: StatementImportCsvColumnRef;
      invertSign?: boolean;
    }
  | {
      mode: "debit-credit";
      debitColumn?: StatementImportCsvColumnRef;
      creditColumn?: StatementImportCsvColumnRef;
    };

export type StatementImportCsvDescriptionMapping =
  | StatementImportCsvColumnRef
  | {
      columns: readonly StatementImportCsvColumnRef[];
      separator?: string;
    };

export type StatementImportCsvMappings = {
  date: StatementImportCsvColumnRef;
  amount: StatementImportCsvAmountMapping;
  originalAmount?: StatementImportCsvColumnRef;
  originalCurrency?: StatementImportCsvColumnRef;
  exchangeRate?: StatementImportCsvColumnRef;
  description?: StatementImportCsvDescriptionMapping;
};

export type StatementImportCsvFormat = {
  hasHeader: boolean;
  delimitersToGuess: readonly string[];
  columns?: readonly StatementImportCsvHeader[];
  mappings?: StatementImportCsvMappings;
  dateFormat?: StatementImportCsvDateFormat;
  numberFormat?: StatementImportCsvNumberFormat;
};

export type NormalizedStatementImportCsvFormat = {
  hasHeader: boolean;
  delimitersToGuess: readonly string[];
  mappings: StatementImportCsvMappings;
  dateFormat: StatementImportCsvDateFormat;
  numberFormat: StatementImportCsvNumberFormat;
  orderedColumns: readonly StatementImportCsvHeader[] | null;
};

export type HeaderIndex = Map<string, number>;

export type ReadFormatResult = {
  format: StatementImportCsvFormat | null;
  errors: string[];
};
