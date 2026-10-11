import { parseUtcDayDate } from "@/shared/date";
import { type StatementImportCsvRow } from "../types";
import {
  isMultiColumnDescriptionMapping,
  resolveColumnIndex,
  type HeaderIndex,
  type NormalizedStatementImportCsvFormat,
} from "./format";

const STRICT_DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export function validateCsvRowShape(args: {
  row: string[];
  headerColumnCount: number | undefined;
  headerIndex: HeaderIndex | undefined;
  delimiter: string;
  format: NormalizedStatementImportCsvFormat;
  minimumColumnCount: number;
  sourceRowNumber: number;
}): string[] {
  const errors: string[] = [];
  if (args.row.length < args.minimumColumnCount) {
    errors.push(
      `Row ${args.sourceRowNumber}: CSV row must include at least ${args.minimumColumnCount} columns.`,
    );
  }
  if (
    args.headerColumnCount != null &&
    args.row.length > args.headerColumnCount
  ) {
    errors.push(
      `Row ${args.sourceRowNumber}: CSV row has more columns than the header row; check for unquoted delimiters in values.`,
    );
  }
  if (
    args.delimiter === "," &&
    args.row.length > args.minimumColumnCount &&
    isLikelyShiftedByUnquotedExchangeRateDecimalComma(
      args.row,
      args.format,
      args.headerIndex,
    )
  ) {
    errors.push(
      `Row ${args.sourceRowNumber}: CSV row appears to have an unquoted decimal comma before the description column; use semicolon delimiter or quote the value.`,
    );
  }

  return errors;
}

function isLikelyShiftedByUnquotedExchangeRateDecimalComma(
  row: string[],
  format: NormalizedStatementImportCsvFormat,
  headerIndex: HeaderIndex | undefined,
): boolean {
  const exchangeRateColumnIndex = resolveColumnIndex(
    format.mappings.exchangeRate ?? -1,
    headerIndex,
  );
  const descriptionMapping = format.mappings.description ?? -1;
  const descriptionColumnIndex = isMultiColumnDescriptionMapping(
    descriptionMapping,
  )
    ? -1
    : resolveColumnIndex(descriptionMapping, headerIndex);
  if (
    exchangeRateColumnIndex === -1 ||
    descriptionColumnIndex === -1 ||
    exchangeRateColumnIndex + 1 !== descriptionColumnIndex
  ) {
    return false;
  }

  const exchangeRateIntegerPart = row[exchangeRateColumnIndex]?.trim() ?? "";
  const shiftedDecimalPart = row[descriptionColumnIndex]?.trim() ?? "";
  const displacedDescription = row[descriptionColumnIndex + 1]?.trim() ?? "";
  return (
    /^\d+$/.test(exchangeRateIntegerPart) &&
    /^\d+$/.test(shiftedDecimalPart) &&
    displacedDescription !== ""
  );
}

export function validateCsvRow(
  row: StatementImportCsvRow,
  sourceRowNumber: number,
): string[] {
  const errors: string[] = [];
  const date = parseUtcDayDate(row.date?.trim() ?? "");
  if (!date) {
    errors.push(`Row ${sourceRowNumber}: date must be ISO yyyy-mm-dd.`);
  }

  const amount = validateStrictNumber(row.amount, "amount", sourceRowNumber);
  const originalAmount = validateStrictNumber(
    row["original amount"],
    "original amount",
    sourceRowNumber,
    { required: false },
  );
  errors.push(...amount, ...originalAmount);

  if (Number(row.amount) === 0) {
    errors.push(`Row ${sourceRowNumber}: amount must be non-zero.`);
  }
  const hasOriginalAmount = row["original amount"].trim() !== "";
  const hasOriginalCurrency = row["original currency"].trim() !== "";
  if (hasOriginalAmount && Number(row["original amount"]) === 0) {
    errors.push(`Row ${sourceRowNumber}: original amount must be non-zero.`);
  }
  if (!hasOriginalAmount && hasOriginalCurrency) {
    errors.push(
      `Row ${sourceRowNumber}: original amount is required when original currency is set.`,
    );
  }
  if (hasOriginalAmount && !hasOriginalCurrency) {
    errors.push(
      `Row ${sourceRowNumber}: original currency is required when original amount is set.`,
    );
  }
  if (
    row["original currency"].trim() !== "" &&
    !CURRENCY_PATTERN.test(row["original currency"].trim())
  ) {
    errors.push(
      `Row ${sourceRowNumber}: original currency must be a 3-letter uppercase code.`,
    );
  }

  return errors;
}

function validateStrictNumber(
  value: string | undefined,
  field: string,
  sourceRowNumber: number,
  options?: { required?: boolean },
): string[] {
  const required = options?.required ?? true;
  const trimmed = value?.trim() ?? "";
  if (!trimmed && !required) {
    return [];
  }
  if (!trimmed || !STRICT_DECIMAL_PATTERN.test(trimmed)) {
    return [`Row ${sourceRowNumber}: ${field} must be a dot-decimal number.`];
  }

  const number = Number(trimmed);
  if (!Number.isFinite(number)) {
    return [`Row ${sourceRowNumber}: ${field} must be finite.`];
  }

  return [];
}
