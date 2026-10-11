import {
  STATEMENT_IMPORT_CSV_HEADERS,
  type ReadFormatResult,
  type StatementImportCsvFormat,
  type StatementImportCsvHeader,
  type StatementImportCsvDateFormat,
  type StatementImportCsvNumberFormat,
} from "./types";
import { isRecord, readOptionalMappings } from "./read-mappings";
import { normalizeStatementImportCsvFormat } from "./normalize";

const STATEMENT_IMPORT_CSV_HEADER_SET = new Set<string>(
  STATEMENT_IMPORT_CSV_HEADERS,
);

const STATEMENT_IMPORT_CSV_DATE_FORMAT_SET = new Set<string>([
  "yyyy-MM-dd",
  "dd.MM.yyyy",
  "MM/dd/yyyy",
]);

const DECIMAL_SEPARATOR_SET = new Set<string>([".", ","]);

const THOUSANDS_SEPARATOR_SET = new Set<string>([".", ",", "'", " "]);

export function readStatementImportCsvFormat(input: unknown): ReadFormatResult {
  if (input == null) {
    return { format: null, errors: [] };
  }
  if (!isRecord(input)) {
    return {
      format: null,
      errors: ["Statement import CSV format must be an object."],
    };
  }

  const errors: string[] = [];
  const hasHeader = readRequiredBoolean(
    input.hasHeader,
    "CSV format hasHeader must be true or false.",
    errors,
  );
  const delimitersToGuess = readRequiredStringArray(
    input.delimitersToGuess,
    "CSV format delimitersToGuess must be a non-empty string array.",
    errors,
  );
  const columns = readOptionalColumns(input.columns, errors);
  const mappings = readOptionalMappings(input.mappings, errors);
  const dateFormat = readOptionalDateFormat(input.dateFormat, errors);
  const numberFormat = readOptionalNumberFormat(input.numberFormat, errors);

  if (errors.length > 0) {
    return { format: null, errors };
  }

  const format: StatementImportCsvFormat = {
    hasHeader: hasHeader!,
    delimitersToGuess: delimitersToGuess!,
    ...(columns ? { columns } : undefined),
    ...(mappings ? { mappings } : undefined),
    ...(dateFormat ? { dateFormat } : undefined),
    ...(numberFormat ? { numberFormat } : undefined),
  };
  const normalized = normalizeStatementImportCsvFormat(format);
  return normalized.errors.length > 0
    ? { format: null, errors: normalized.errors }
    : { format, errors: [] };
}

export function parseStatementImportCsvFormatJson(
  value: string | null | undefined,
): ReadFormatResult {
  if (!value?.trim()) {
    return { format: null, errors: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return {
      format: null,
      errors: ["Statement import CSV format must be valid JSON."],
    };
  }

  return readStatementImportCsvFormat(parsed);
}

function readRequiredBoolean(
  value: unknown,
  message: string,
  errors: string[],
): boolean | undefined {
  if (typeof value !== "boolean") {
    errors.push(message);
    return undefined;
  }
  return value;
}

function readRequiredStringArray(
  value: unknown,
  message: string,
  errors: string[],
): readonly string[] | undefined {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    errors.push(message);
    return undefined;
  }
  return value;
}

function readOptionalColumns(
  value: unknown,
  errors: string[],
): readonly StatementImportCsvHeader[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(value) ||
    value.some(
      (column) =>
        typeof column !== "string" ||
        !STATEMENT_IMPORT_CSV_HEADER_SET.has(column),
    )
  ) {
    errors.push(
      "CSV format columns must use supported statement import fields.",
    );
    return undefined;
  }
  return value as StatementImportCsvHeader[];
}

function readOptionalDateFormat(
  value: unknown,
  errors: string[],
): StatementImportCsvDateFormat | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "string" ||
    !STATEMENT_IMPORT_CSV_DATE_FORMAT_SET.has(value)
  ) {
    errors.push("CSV format dateFormat is invalid.");
    return undefined;
  }
  return value as StatementImportCsvDateFormat;
}

function readOptionalNumberFormat(
  value: unknown,
  errors: string[],
): StatementImportCsvNumberFormat | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    errors.push("CSV format numberFormat must be an object.");
    return undefined;
  }
  const decimalSeparator = value.decimalSeparator;
  const thousandsSeparator = value.thousandsSeparator;
  if (
    typeof decimalSeparator !== "string" ||
    !DECIMAL_SEPARATOR_SET.has(decimalSeparator)
  ) {
    errors.push("CSV format decimal separator is invalid.");
  }
  if (
    thousandsSeparator !== undefined &&
    (typeof thousandsSeparator !== "string" ||
      !THOUSANDS_SEPARATOR_SET.has(thousandsSeparator))
  ) {
    errors.push("CSV format thousands separator is invalid.");
  }
  if (errors.length > 0) {
    return undefined;
  }
  return {
    decimalSeparator: decimalSeparator as "." | ",",
    ...(typeof thousandsSeparator === "string"
      ? { thousandsSeparator: thousandsSeparator as "." | "," | "'" | " " }
      : undefined),
  };
}
