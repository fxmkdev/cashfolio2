import type { StatementImportCsvFormat } from "@/shared/statement-import-csv-format";

export const signedFormat: StatementImportCsvFormat = {
  hasHeader: true,
  delimitersToGuess: [",", ";"],
  dateFormat: "yyyy-MM-dd",
  numberFormat: { decimalSeparator: "." },
  mappings: {
    date: { header: "Date" },
    amount: { mode: "signed", column: { header: "Amount" } },
    description: {
      columns: [{ header: "Payee" }, { header: "Details" }],
      separator: " · ",
    },
  },
};

export const debitCreditFormat: StatementImportCsvFormat = {
  ...signedFormat,
  delimitersToGuess: [";"],
  dateFormat: "dd.MM.yyyy",
  numberFormat: { decimalSeparator: "," },
  mappings: {
    ...signedFormat.mappings!,
    amount: {
      mode: "debit-credit",
      debitColumn: { header: "Debit" },
      creditColumn: { header: "Credit" },
    },
  },
};

export const headerlessFormat: StatementImportCsvFormat = {
  ...signedFormat,
  hasHeader: false,
  mappings: {
    date: { index: 0 },
    amount: { mode: "signed", column: { index: 1 } },
    description: { columns: [{ index: 2 }, { index: 3 }], separator: " · " },
  },
};

export const foreignCurrencyFormat: StatementImportCsvFormat = {
  ...signedFormat,
  mappings: {
    ...signedFormat.mappings!,
    originalAmount: { header: "Original Amount" },
    originalCurrency: { header: "Original Currency" },
    exchangeRate: { header: "Exchange Rate" },
  },
};

export const orderedFormat: StatementImportCsvFormat = {
  hasHeader: true,
  delimitersToGuess: [","],
  columns: [
    "date",
    "amount",
    "original amount",
    "original currency",
    "exchange rate",
    "description",
  ],
};
