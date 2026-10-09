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

type ReadFormatResult = {
  format: StatementImportCsvFormat | null;
  errors: string[];
};

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

function validateMappings(
  mappings: StatementImportCsvMappings,
  hasHeader: boolean,
): string[] {
  const errors: string[] = [];
  const refs = collectColumnRefs(mappings);
  refs.forEach((ref) => {
    if (isHeaderRef(ref) && !hasHeader) {
      errors.push(
        `CSV format cannot use header column "${ref.header}" when hasHeader is false.`,
      );
    }
    const index = getColumnRefIndex(ref);
    if (index != null && (!Number.isInteger(index) || index < 0)) {
      errors.push("CSV format column indexes must be zero-based integers.");
    }
  });

  if (
    mappings.amount.mode === "debit-credit" &&
    mappings.amount.debitColumn == null &&
    mappings.amount.creditColumn == null
  ) {
    errors.push("CSV format must define a debit or credit column.");
  }

  return errors;
}

function validateNumberFormat(
  numberFormat: StatementImportCsvNumberFormat,
): string[] {
  if (
    numberFormat.thousandsSeparator != null &&
    numberFormat.decimalSeparator === numberFormat.thousandsSeparator
  ) {
    return ["CSV format decimal and thousands separators must be different."];
  }

  return [];
}

export function collectColumnRefs(
  mappings: StatementImportCsvMappings,
): StatementImportCsvColumnRef[] {
  const refs: StatementImportCsvColumnRef[] = [mappings.date];
  const amountRefs =
    mappings.amount.mode === "signed"
      ? [mappings.amount.column]
      : [mappings.amount.debitColumn, mappings.amount.creditColumn];
  refs.push(...amountRefs.filter(isColumnRef));
  refs.push(
    ...[
      mappings.originalAmount,
      mappings.originalCurrency,
      mappings.exchangeRate,
    ].filter(isColumnRef),
  );

  if (mappings.description !== undefined) {
    if (isMultiColumnDescriptionMapping(mappings.description)) {
      refs.push(...mappings.description.columns);
    } else {
      refs.push(mappings.description);
    }
  }

  return refs;
}

function isColumnRef(
  ref: StatementImportCsvColumnRef | undefined,
): ref is StatementImportCsvColumnRef {
  return ref !== undefined;
}

export function isHeaderRef(
  ref: StatementImportCsvColumnRef,
): ref is { header: string } {
  return typeof ref === "object" && "header" in ref;
}

export function isMultiColumnDescriptionMapping(
  mapping: StatementImportCsvDescriptionMapping,
): mapping is {
  columns: readonly StatementImportCsvColumnRef[];
  separator?: string;
} {
  return typeof mapping === "object" && "columns" in mapping;
}

function getColumnRefIndex(
  ref: StatementImportCsvColumnRef,
): number | undefined {
  if (typeof ref === "number") {
    return ref;
  }
  return "index" in ref ? ref.index : undefined;
}

export function getMinimumColumnCount(
  format: NormalizedStatementImportCsvFormat,
): number {
  if (format.orderedColumns) {
    return format.orderedColumns.length;
  }

  const indexes = collectColumnRefs(format.mappings)
    .map(getColumnRefIndex)
    .filter((index): index is number => index != null);
  return indexes.length === 0 ? 0 : Math.max(...indexes) + 1;
}

export function getMissingCsvShapeMessage(
  format: NormalizedStatementImportCsvFormat,
  minimumColumnCount: number,
): string {
  if (format.orderedColumns) {
    return `CSV must include at least ${minimumColumnCount} columns in this order: ${format.orderedColumns.join(", ")}`;
  }

  return `CSV must include at least ${minimumColumnCount} columns for the selected import format.`;
}

export function createHeaderIndex(headerRow: string[]): HeaderIndex {
  return new Map(
    headerRow.map((header, index) => [normalizeHeaderName(header), index]),
  );
}

function normalizeHeaderName(value: string): string {
  return value.trim().toLowerCase();
}

export function validateMappedHeaders(
  format: NormalizedStatementImportCsvFormat,
  headerIndex: HeaderIndex,
): string[] {
  return collectColumnRefs(format.mappings)
    .filter(isHeaderRef)
    .filter((ref) => !headerIndex.has(normalizeHeaderName(ref.header)))
    .map((ref) => `CSV header is missing mapped column "${ref.header}".`);
}

export function shouldRejectLikelyHeaderlessFirstRow(
  format: NormalizedStatementImportCsvFormat,
): boolean {
  return (
    format.orderedColumns != null ||
    collectColumnRefs(format.mappings).every((ref) => !isHeaderRef(ref))
  );
}

export function getColumnValue(
  row: string[],
  ref: StatementImportCsvColumnRef | undefined,
  headerIndex: HeaderIndex | undefined,
): string {
  if (ref == null) {
    return "";
  }
  const index = resolveColumnIndex(ref, headerIndex);
  return index === -1 ? "" : (row[index] ?? "");
}

export function resolveColumnIndex(
  ref: StatementImportCsvColumnRef,
  headerIndex: HeaderIndex | undefined,
): number {
  if (typeof ref === "number") {
    return ref;
  }
  if ("index" in ref) {
    return ref.index;
  }

  return headerIndex?.get(normalizeHeaderName(ref.header)) ?? -1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function readOptionalMappings(
  value: unknown,
  errors: string[],
): StatementImportCsvMappings | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    errors.push("CSV format mappings must be an object.");
    return undefined;
  }

  const date = readColumnRef(value.date, "CSV format date mapping", errors);
  const amount = readAmountMapping(value.amount, errors);
  const originalAmount = readOptionalColumnRef(
    value.originalAmount,
    "CSV format originalAmount mapping",
    errors,
  );
  const originalCurrency = readOptionalColumnRef(
    value.originalCurrency,
    "CSV format originalCurrency mapping",
    errors,
  );
  const exchangeRate = readOptionalColumnRef(
    value.exchangeRate,
    "CSV format exchangeRate mapping",
    errors,
  );
  const description = readOptionalDescriptionMapping(value.description, errors);

  if (date === undefined || amount === undefined) {
    return undefined;
  }

  return {
    date,
    amount,
    ...(originalAmount !== undefined ? { originalAmount } : undefined),
    ...(originalCurrency !== undefined ? { originalCurrency } : undefined),
    ...(exchangeRate !== undefined ? { exchangeRate } : undefined),
    ...(description !== undefined ? { description } : undefined),
  };
}

function readAmountMapping(
  value: unknown,
  errors: string[],
): StatementImportCsvAmountMapping | undefined {
  if (!isRecord(value)) {
    errors.push("CSV format amount mapping must be an object.");
    return undefined;
  }
  if (value.mode === "signed") {
    const column = readColumnRef(
      value.column,
      "CSV format signed amount column",
      errors,
    );
    if (column === undefined) {
      return undefined;
    }
    return {
      mode: "signed",
      column,
      ...(typeof value.invertSign === "boolean"
        ? { invertSign: value.invertSign }
        : undefined),
    };
  }
  if (value.mode === "debit-credit") {
    return {
      mode: "debit-credit",
      ...(value.debitColumn !== undefined
        ? {
            debitColumn: readColumnRef(
              value.debitColumn,
              "CSV format debit column",
              errors,
            ),
          }
        : undefined),
      ...(value.creditColumn !== undefined
        ? {
            creditColumn: readColumnRef(
              value.creditColumn,
              "CSV format credit column",
              errors,
            ),
          }
        : undefined),
    };
  }

  errors.push("CSV format amount mapping mode is invalid.");
  return undefined;
}

function readOptionalDescriptionMapping(
  value: unknown,
  errors: string[],
): StatementImportCsvDescriptionMapping | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (isRecord(value) && "columns" in value) {
    if (
      !Array.isArray(value.columns) ||
      value.columns.length === 0 ||
      (value.separator !== undefined && typeof value.separator !== "string")
    ) {
      errors.push("CSV format description columns mapping is invalid.");
      return undefined;
    }
    const columns = value.columns
      .map((column) =>
        readColumnRef(column, "CSV format description column", errors),
      )
      .filter(
        (column): column is StatementImportCsvColumnRef => column !== undefined,
      );
    if (columns.length !== value.columns.length) {
      return undefined;
    }
    return {
      columns,
      ...(typeof value.separator === "string"
        ? { separator: value.separator }
        : undefined),
    };
  }

  return readColumnRef(value, "CSV format description mapping", errors);
}

function readOptionalColumnRef(
  value: unknown,
  label: string,
  errors: string[],
): StatementImportCsvColumnRef | undefined {
  return value === undefined ? undefined : readColumnRef(value, label, errors);
}

function readColumnRef(
  value: unknown,
  label: string,
  errors: string[],
): StatementImportCsvColumnRef | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (!isRecord(value)) {
    errors.push(`${label} must be a column index or header reference.`);
    return undefined;
  }
  if (typeof value.index === "number") {
    return { index: value.index };
  }
  if (typeof value.header === "string" && value.header.trim()) {
    return { header: value.header };
  }

  errors.push(`${label} must be a column index or header reference.`);
  return undefined;
}
