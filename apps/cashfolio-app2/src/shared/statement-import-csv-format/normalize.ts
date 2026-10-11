import {
  type StatementImportCsvFormat,
  type NormalizedStatementImportCsvFormat,
  STATEMENT_IMPORT_CSV_HEADERS,
  type StatementImportCsvHeader,
  type StatementImportCsvMappings,
} from "./types";
import { validateMappings, validateNumberFormat } from "./validation";

export function normalizeStatementImportCsvFormat(
  format: StatementImportCsvFormat,
): {
  format: NormalizedStatementImportCsvFormat;
  errors: string[];
} {
  const errors: string[] = [];
  const columns = format.columns;
  const mappings =
    format.mappings ?? (columns ? createMappingsFromColumns(columns) : null);
  const numberFormat = format.numberFormat ?? { decimalSeparator: "." };

  if (!mappings) {
    errors.push("CSV format must define either ordered columns or mappings.");
  } else {
    errors.push(...validateMappings(mappings, format.hasHeader));
  }
  errors.push(...validateNumberFormat(numberFormat));

  return {
    format: {
      hasHeader: format.hasHeader,
      delimitersToGuess: format.delimitersToGuess,
      mappings:
        mappings ?? createMappingsFromColumns(STATEMENT_IMPORT_CSV_HEADERS),
      dateFormat: format.dateFormat ?? "yyyy-MM-dd",
      numberFormat,
      orderedColumns: format.mappings ? null : (columns ?? null),
    },
    errors,
  };
}

function createMappingsFromColumns(
  columns: readonly StatementImportCsvHeader[],
): StatementImportCsvMappings {
  const getOptionalColumnIndex = (column: StatementImportCsvHeader) => {
    const index = columns.indexOf(column);
    return index === -1 ? undefined : index;
  };

  return {
    date: columns.indexOf("date"),
    amount: {
      mode: "signed",
      column: columns.indexOf("amount"),
    },
    originalAmount: getOptionalColumnIndex("original amount"),
    originalCurrency: getOptionalColumnIndex("original currency"),
    exchangeRate: getOptionalColumnIndex("exchange rate"),
    description: getOptionalColumnIndex("description"),
  };
}
