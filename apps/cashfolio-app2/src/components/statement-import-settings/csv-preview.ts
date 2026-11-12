import Papa from "papaparse";
import Decimal from "decimal.js";
import { Temporal } from "@/shared/temporal";
import {
  collectColumnRefs,
  isMultiColumnDescriptionMapping,
  normalizeStatementImportCsvFormat,
  type StatementImportCsvColumnRef,
  type StatementImportCsvFormat,
  type StatementImportCsvNumberFormat,
} from "@/shared/statement-import-csv-format";

export const PREVIEW_ROW_LIMIT = 20;
export type SamplePreview = {
  headers: string[];
  rows: { id: string; sourceRow: number; values: string[] }[];
  errors: string[];
  truncated: boolean;
  delimiter: string;
};
export type ParsedPreviewRow = {
  id: string;
  sourceRow: number;
  date: string;
  amount: string;
  description: string;
  originalAmount: string;
  originalCurrency: string;
  exchangeRate: string;
  errors: string;
};

export function parseSample(
  text: string,
  hasHeader: boolean,
  delimiters: readonly string[],
): SamplePreview {
  if (!text.trim())
    return {
      headers: [],
      rows: [],
      errors: ["The sample contains no data."],
      truncated: false,
      delimiter: "",
    };
  if (
    !delimiters.length ||
    delimiters.some((value) => !value || /[\r\n"\ufeff]/.test(value))
  )
    return {
      headers: [],
      rows: [],
      errors: ["Choose valid delimiter candidates to preview the sample."],
      truncated: false,
      delimiter: "",
    };
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    delimitersToGuess: [...delimiters],
    preview: PREVIEW_ROW_LIMIT + (hasHeader ? 1 : 0) + 1,
  });
  const data = hasHeader ? parsed.data.slice(1) : parsed.data;
  const rows = data.slice(0, PREVIEW_ROW_LIMIT).map((values, index) => ({
    id: String(index),
    sourceRow: index + (hasHeader ? 2 : 1),
    values,
  }));
  const errors = parsed.errors.map(
    (error) =>
      `${error.row != null ? `Row ${error.row + 1}: ` : ""}${error.message}`,
  );
  if (!rows.length) errors.push("The sample contains no data rows.");
  return {
    headers: hasHeader ? (parsed.data[0] ?? []) : [],
    rows,
    errors,
    truncated: data.length > PREVIEW_ROW_LIMIT || parsed.meta.truncated,
    delimiter: parsed.meta.delimiter,
  };
}

function resolveIndex(
  ref: StatementImportCsvColumnRef,
  sample: SamplePreview,
): number {
  if (typeof ref === "number") return ref;
  if ("index" in ref) return ref.index;
  const matches = sample.headers.flatMap((header, index) =>
    header.trim().toLowerCase() === ref.header.trim().toLowerCase()
      ? [index]
      : [],
  );
  if (!matches.length)
    throw new Error(`Column “${ref.header}” is missing from the sample.`);
  if (matches.length > 1)
    throw new Error(
      `Column “${ref.header}” is ambiguous; use a column position.`,
    );
  return matches[0];
}

export function getSampleMappingErrors(
  sample: SamplePreview,
  format: StatementImportCsvFormat,
): string[] {
  const normalized = normalizeStatementImportCsvFormat(format).format;
  const errors = collectColumnRefs(normalized.mappings).flatMap((ref) => {
    try {
      const index = resolveIndex(ref, sample);
      const width = Math.max(
        sample.headers.length,
        ...sample.rows.map((row) => row.values.length),
      );
      return index >= width
        ? [`Column ${index + 1} is missing from the sample.`]
        : [];
    } catch (error) {
      return [
        error instanceof Error
          ? error.message
          : "A mapped column is unavailable.",
      ];
    }
  });
  return [...new Set(errors)];
}

function parseNumber(
  value: string,
  format: StatementImportCsvNumberFormat,
): Decimal {
  let normalized = value.trim().replace(/\u00a0/g, " ");
  if (format.thousandsSeparator)
    normalized = normalized.split(format.thousandsSeparator).join("");
  if (format.decimalSeparator === ",") {
    if (normalized.includes("."))
      throw new Error("Value does not match the number format.");
    normalized = normalized.replace(",", ".");
  }
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized))
    throw new Error("Value does not match the number format.");
  return new Decimal(normalized);
}

function parseDate(value: string, format: string): string {
  const match =
    format === "yyyy-MM-dd"
      ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
      : format === "dd.MM.yyyy"
        ? /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim())
        : /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) throw new Error(`Date must match ${format}.`);
  const [year, month, day] =
    format === "yyyy-MM-dd"
      ? [match[1], match[2], match[3]]
      : format === "dd.MM.yyyy"
        ? [match[3], match[2], match[1]]
        : [match[3], match[1], match[2]];
  return Temporal.PlainDate.from(
    { year: Number(year), month: Number(month), day: Number(day) },
    { overflow: "reject" },
  ).toString();
}

export function createParsedPreview(
  sample: SamplePreview,
  format: StatementImportCsvFormat,
): ParsedPreviewRow[] {
  const normalized = normalizeStatementImportCsvFormat(format).format;
  const { mappings, numberFormat } = normalized;
  return sample.rows.map((row) => {
    const errors: string[] = [];
    if (normalized.hasHeader && row.values.length > sample.headers.length) {
      errors.push(
        "This row has more columns than the header row; check CSV quoting.",
      );
    }
    const get = (ref?: StatementImportCsvColumnRef) => {
      if (ref == null) return "";
      const index = resolveIndex(ref, sample);
      if (index >= row.values.length)
        throw new Error(`Column ${index + 1} is missing from this row.`);
      return row.values[index].trim();
    };
    const attempt = (label: string, operation: () => string) => {
      try {
        return operation();
      } catch (error) {
        errors.push(
          `${label}: ${error instanceof Error ? error.message : "Invalid value."}`,
        );
        return "";
      }
    };
    const date = attempt("Date", () =>
      parseDate(get(mappings.date), normalized.dateFormat),
    );
    const amount = attempt("Amount", () => {
      if (mappings.amount.mode === "signed") {
        const amount = parseNumber(get(mappings.amount.column), numberFormat);
        if (amount.isZero()) throw new Error("Amount must be non-zero.");
        return (
          mappings.amount.invertSign ? amount.negated() : amount
        ).toFixed();
      }
      const debitValue = get(mappings.amount.debitColumn);
      const creditValue = get(mappings.amount.creditColumn);
      const debit = debitValue
        ? parseNumber(debitValue, numberFormat).abs()
        : new Decimal(0);
      const credit = creditValue
        ? parseNumber(creditValue, numberFormat).abs()
        : new Decimal(0);
      if (!debit.isZero() && !credit.isZero())
        throw new Error("Debit and credit cannot both be set.");
      if (debit.isZero() && credit.isZero())
        throw new Error("A debit or credit amount is required.");
      return (debit.isZero() ? credit.negated() : debit).toFixed();
    });
    const description = attempt("Description", () => {
      const mapping = mappings.description;
      if (mapping == null) return "";
      return isMultiColumnDescriptionMapping(mapping)
        ? mapping.columns
            .map(get)
            .filter(Boolean)
            .join(mapping.separator ?? " - ")
        : get(mapping);
    });
    const originalAmount = attempt("Original amount", () => {
      const value = get(mappings.originalAmount);
      if (!value) return "";
      const amount = parseNumber(value, numberFormat);
      if (amount.isZero()) throw new Error("Original amount must be non-zero.");
      return amount.toFixed();
    });
    const originalCurrency = attempt("Original currency", () =>
      get(mappings.originalCurrency),
    );
    if (originalAmount && !originalCurrency)
      errors.push(
        "Original currency: Required when an original amount is set.",
      );
    if (originalCurrency && !originalAmount)
      errors.push(
        "Original amount: Required when an original currency is set.",
      );
    if (originalCurrency && !/^[A-Z]{3}$/.test(originalCurrency))
      errors.push("Original currency: Use a 3-letter uppercase currency code.");
    const exchangeRate = attempt("Exchange rate", () =>
      get(mappings.exchangeRate),
    );
    return {
      id: row.id,
      sourceRow: row.sourceRow,
      date,
      amount,
      description,
      originalAmount,
      originalCurrency,
      exchangeRate,
      errors: errors.join(" "),
    };
  });
}
