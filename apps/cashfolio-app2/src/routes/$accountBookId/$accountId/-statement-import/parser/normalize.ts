import { parseUtcDayDate } from "@/shared/date";
import {
  type StatementImportCsvAmountMapping,
  type StatementImportCsvDateFormat,
  type StatementImportCsvDescriptionMapping,
  type StatementImportCsvNumberFormat,
} from "@/shared/statement-import-csv-format";
import { type StatementImportCsvRow } from "../types";
import {
  getColumnValue,
  isMultiColumnDescriptionMapping,
  type HeaderIndex,
  type NormalizedStatementImportCsvFormat,
} from "./format";
import {
  invertCanonicalNumberText,
  negateCanonicalNumberText,
  normalizeNumberValue,
  STRICT_DECIMAL_PATTERN,
  toAbsoluteCanonicalNumberText,
} from "./number";

const DATE_LIKE_PATTERN = /^\d{1,4}[-./]\d{1,2}[-./]\d{1,4}$/;
const NUMBER_LIKE_PATTERN = /^-?[\d\s'.,]+$/;
const DEFAULT_DESCRIPTION_SEPARATOR = " - ";

export function toStatementImportCsvRow(args: {
  row: string[];
  format: NormalizedStatementImportCsvFormat;
  headerIndex: HeaderIndex | undefined;
  sourceRowNumber: number;
}): { row: StatementImportCsvRow; errors: string[] } {
  const { format, headerIndex, row, sourceRowNumber } = args;
  if (shouldUseLegacyOrderedRowMapping(format)) {
    return toLegacyStatementImportCsvRow({ row, format, headerIndex });
  }

  return toNormalizedStatementImportCsvRow({
    row,
    format,
    headerIndex,
    sourceRowNumber,
  });
}

function toLegacyStatementImportCsvRow(args: {
  row: string[];
  format: NormalizedStatementImportCsvFormat;
  headerIndex: HeaderIndex | undefined;
}): { row: StatementImportCsvRow; errors: string[] } {
  const { format, headerIndex, row } = args;
  const mappings = format.mappings;
  return {
    row: {
      date: getColumnValue(row, mappings.date, headerIndex),
      amount:
        mappings.amount.mode === "signed"
          ? getColumnValue(row, mappings.amount.column, headerIndex)
          : "",
      "original amount": getColumnValue(
        row,
        mappings.originalAmount,
        headerIndex,
      ),
      "original currency": getColumnValue(
        row,
        mappings.originalCurrency,
        headerIndex,
      ),
      "exchange rate": getColumnValue(row, mappings.exchangeRate, headerIndex),
      description: getDescriptionValue(row, mappings.description, headerIndex),
    },
    errors: [],
  };
}

function toNormalizedStatementImportCsvRow(args: {
  row: string[];
  format: NormalizedStatementImportCsvFormat;
  headerIndex: HeaderIndex | undefined;
  sourceRowNumber: number;
}): { row: StatementImportCsvRow; errors: string[] } {
  const { format, headerIndex, row, sourceRowNumber } = args;
  const mappings = format.mappings;
  const errors: string[] = [];
  const date = normalizeDateValue({
    value: getColumnValue(row, mappings.date, headerIndex),
    format: format.dateFormat,
    sourceRowNumber,
  });
  const amount = normalizeAmountValue({
    mapping: mappings.amount,
    row,
    headerIndex,
    numberFormat: format.numberFormat,
    sourceRowNumber,
  });
  const originalAmount = normalizeOptionalNumberValue({
    value: getColumnValue(row, mappings.originalAmount, headerIndex),
    field: "original amount",
    numberFormat: format.numberFormat,
    sourceRowNumber,
  });

  errors.push(...date.errors, ...amount.errors, ...originalAmount.errors);

  return {
    row: {
      date: date.value,
      amount: amount.value,
      "original amount": originalAmount.value,
      "original currency": getColumnValue(
        row,
        mappings.originalCurrency,
        headerIndex,
      ),
      "exchange rate": getColumnValue(row, mappings.exchangeRate, headerIndex),
      description: getDescriptionValue(row, mappings.description, headerIndex),
    },
    errors,
  };
}

function shouldUseLegacyOrderedRowMapping(
  format: NormalizedStatementImportCsvFormat,
): boolean {
  return (
    format.orderedColumns != null &&
    format.dateFormat === "yyyy-MM-dd" &&
    format.numberFormat.decimalSeparator === "." &&
    format.numberFormat.thousandsSeparator == null
  );
}

export function isLikelyHeaderlessDataRow(
  row: string[],
  format: NormalizedStatementImportCsvFormat,
  headerIndex: HeaderIndex | undefined,
): boolean {
  const candidate = toStatementImportCsvRow({
    row,
    format,
    headerIndex,
    sourceRowNumber: 1,
  }).row;
  const date = candidate.date.trim();
  const amount = candidate.amount.trim();
  return (
    parseUtcDayDate(date) != null ||
    DATE_LIKE_PATTERN.test(date) ||
    STRICT_DECIMAL_PATTERN.test(amount) ||
    (NUMBER_LIKE_PATTERN.test(amount) && /\d/.test(amount))
  );
}

function normalizeDateValue(args: {
  value: string;
  format: StatementImportCsvDateFormat;
  sourceRowNumber: number;
}): { value: string; errors: string[] } {
  const trimmed = args.value.trim();
  const date = parseDateWithFormat(trimmed, args.format);
  if (!date) {
    return {
      value: trimmed,
      errors: [`Row ${args.sourceRowNumber}: date must match ${args.format}.`],
    };
  }

  return { value: date.toISOString().slice(0, 10), errors: [] };
}

function parseDateWithFormat(
  value: string,
  format: StatementImportCsvDateFormat,
): Date | null {
  if (format === "yyyy-MM-dd") {
    return parseUtcDayDate(value);
  }

  const match =
    format === "dd.MM.yyyy"
      ? /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value)
      : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) {
    return null;
  }

  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3]);
  return format === "dd.MM.yyyy"
    ? createUtcDateFromParts({ year, month: second, day: first })
    : createUtcDateFromParts({ year, month: first, day: second });
}

function createUtcDateFromParts(args: {
  year: number;
  month: number;
  day: number;
}): Date | null {
  const date = new Date(Date.UTC(args.year, args.month - 1, args.day));
  return date.getUTCFullYear() === args.year &&
    date.getUTCMonth() === args.month - 1 &&
    date.getUTCDate() === args.day
    ? date
    : null;
}

function normalizeAmountValue(args: {
  mapping: StatementImportCsvAmountMapping;
  row: string[];
  headerIndex: HeaderIndex | undefined;
  numberFormat: StatementImportCsvNumberFormat;
  sourceRowNumber: number;
}): { value: string; errors: string[] } {
  if (args.mapping.mode === "signed") {
    return normalizeSignedAmountValue({
      ...args,
      mapping: args.mapping,
    });
  }

  return normalizeDebitCreditAmountValue({
    ...args,
    mapping: args.mapping,
  });
}

function normalizeSignedAmountValue(args: {
  mapping: Extract<StatementImportCsvAmountMapping, { mode: "signed" }>;
  row: string[];
  headerIndex: HeaderIndex | undefined;
  numberFormat: StatementImportCsvNumberFormat;
  sourceRowNumber: number;
}): { value: string; errors: string[] } {
  const parsed = normalizeNumberValue({
    value: getColumnValue(args.row, args.mapping.column, args.headerIndex),
    field: "amount",
    numberFormat: args.numberFormat,
    sourceRowNumber: args.sourceRowNumber,
    required: true,
  });
  if (parsed.errors.length > 0) {
    return parsed;
  }

  return {
    value: args.mapping.invertSign
      ? invertCanonicalNumberText(parsed.value)
      : parsed.value,
    errors: [],
  };
}

function normalizeDebitCreditAmountValue(args: {
  mapping: Extract<StatementImportCsvAmountMapping, { mode: "debit-credit" }>;
  row: string[];
  headerIndex: HeaderIndex | undefined;
  numberFormat: StatementImportCsvNumberFormat;
  sourceRowNumber: number;
}): { value: string; errors: string[] } {
  const debit = normalizeOptionalNumberValue({
    value: getColumnValue(args.row, args.mapping.debitColumn, args.headerIndex),
    field: "debit",
    numberFormat: args.numberFormat,
    sourceRowNumber: args.sourceRowNumber,
  });
  const credit = normalizeOptionalNumberValue({
    value: getColumnValue(
      args.row,
      args.mapping.creditColumn,
      args.headerIndex,
    ),
    field: "credit",
    numberFormat: args.numberFormat,
    sourceRowNumber: args.sourceRowNumber,
  });
  const errors = [...debit.errors, ...credit.errors];
  const debitAmount = debit.value === "" ? 0 : Number(debit.value);
  const creditAmount = credit.value === "" ? 0 : Number(credit.value);
  const hasDebit = Math.abs(debitAmount) > 0;
  const hasCredit = Math.abs(creditAmount) > 0;

  if (hasDebit && hasCredit) {
    errors.push(
      `Row ${args.sourceRowNumber}: debit and credit cannot both be set.`,
    );
  }
  if (!hasDebit && !hasCredit) {
    errors.push(
      `Row ${args.sourceRowNumber}: debit or credit amount is required.`,
    );
  }

  return {
    value: hasDebit
      ? toAbsoluteCanonicalNumberText(debit.value)
      : negateCanonicalNumberText(credit.value),
    errors,
  };
}

function normalizeOptionalNumberValue(args: {
  value: string;
  field: string;
  numberFormat: StatementImportCsvNumberFormat;
  sourceRowNumber: number;
}): { value: string; errors: string[] } {
  return normalizeNumberValue({ ...args, required: false });
}

function getDescriptionValue(
  row: string[],
  mapping: StatementImportCsvDescriptionMapping | undefined,
  headerIndex: HeaderIndex | undefined,
): string {
  if (mapping == null) {
    return "";
  }

  if (!isMultiColumnDescriptionMapping(mapping)) {
    return getColumnValue(row, mapping, headerIndex);
  }

  const separator = mapping.separator ?? DEFAULT_DESCRIPTION_SEPARATOR;
  return mapping.columns
    .map((column) => getColumnValue(row, column, headerIndex).trim())
    .filter(Boolean)
    .join(separator);
}
