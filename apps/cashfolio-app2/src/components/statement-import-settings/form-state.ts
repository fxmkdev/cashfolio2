import { createId } from "@paralleldrive/cuid2";
import {
  isMultiColumnDescriptionMapping,
  normalizeStatementImportCsvFormat,
  readStatementImportCsvFormat,
  type StatementImportCsvColumnRef,
  type StatementImportCsvFormat,
  type StatementImportCsvDateFormat,
  type StatementImportCsvNumberFormat,
} from "@/shared/statement-import-csv-format";

export type ColumnChoice = { kind: "header" | "position"; value: string };
export type DescriptionChoice = { id: string; column: ColumnChoice };
export type SettingsDraft = {
  enabled: boolean;
  hasHeader: boolean;
  delimiters: string[];
  dateFormat: StatementImportCsvDateFormat;
  numberFormat: StatementImportCsvNumberFormat;
  amountMode: "signed" | "debit-credit";
  invertSign: boolean;
  date: ColumnChoice;
  amount: ColumnChoice;
  debit: ColumnChoice;
  credit: ColumnChoice;
  descriptions: DescriptionChoice[];
  separator: string;
  originalAmount: ColumnChoice;
  originalCurrency: ColumnChoice;
  exchangeRate: ColumnChoice;
};
export type MappingField =
  | "date"
  | "amount"
  | "debit"
  | "credit"
  | "originalAmount"
  | "originalCurrency"
  | "exchangeRate";

export function columnChoice(
  ref?: StatementImportCsvColumnRef,
  hasHeader = true,
): ColumnChoice {
  if (ref == null)
    return { kind: hasHeader ? "header" : "position", value: "" };
  if (typeof ref === "object" && "header" in ref)
    return { kind: "header", value: ref.header };
  return {
    kind: "position",
    value: String((typeof ref === "number" ? ref : ref.index) + 1),
  };
}

export function createSettingsDraft(
  initialFormat: StatementImportCsvFormat | null,
): SettingsDraft {
  const normalized = initialFormat
    ? normalizeStatementImportCsvFormat(initialFormat).format
    : null;
  const mappings = normalized?.mappings;
  const hasHeader = normalized?.hasHeader ?? true;
  const choice = (ref?: StatementImportCsvColumnRef) =>
    columnChoice(ref, hasHeader);
  const description = mappings?.description;
  const descriptionColumns =
    description == null
      ? []
      : isMultiColumnDescriptionMapping(description)
        ? description.columns
        : [description];
  return {
    enabled: initialFormat !== null,
    hasHeader,
    delimiters: [...(normalized?.delimitersToGuess ?? [",", ";"])],
    dateFormat: normalized?.dateFormat ?? "yyyy-MM-dd",
    numberFormat: {
      ...(normalized?.numberFormat ?? { decimalSeparator: "." }),
    },
    amountMode: mappings?.amount.mode ?? "signed",
    invertSign:
      mappings?.amount.mode === "signed" && !!mappings.amount.invertSign,
    date: choice(mappings?.date),
    amount: choice(
      mappings?.amount.mode === "signed" ? mappings.amount.column : undefined,
    ),
    debit: choice(
      mappings?.amount.mode === "debit-credit"
        ? mappings.amount.debitColumn
        : undefined,
    ),
    credit: choice(
      mappings?.amount.mode === "debit-credit"
        ? mappings.amount.creditColumn
        : undefined,
    ),
    descriptions: descriptionColumns.map((ref) => ({
      id: createId(),
      column: choice(ref),
    })),
    // Preserve the importer's implicit separator when editing existing mappings.
    separator:
      description != null && isMultiColumnDescriptionMapping(description)
        ? (description.separator ?? " - ")
        : " ",
    originalAmount: choice(mappings?.originalAmount),
    originalCurrency: choice(mappings?.originalCurrency),
    exchangeRate: choice(mappings?.exchangeRate),
  };
}

export function validateSettings(draft: SettingsDraft): {
  format: StatementImportCsvFormat | null;
  fieldErrors: Record<string, string>;
  errors: string[];
} {
  if (!draft.enabled) return { format: null, fieldErrors: {}, errors: [] };
  const fieldErrors: Record<string, string> = {};
  function read(
    choice: ColumnChoice,
    key: string,
    required = false,
  ): StatementImportCsvColumnRef | undefined {
    if (!choice.value.trim()) {
      if (required) fieldErrors[key] = "Choose a column.";
      return undefined;
    }
    if (choice.kind === "header") {
      if (!draft.hasHeader)
        fieldErrors[key] = "Enable the header row or use a column position.";
      return { header: choice.value.trim() };
    }
    if (
      !/^\d+$/.test(choice.value) ||
      !Number.isSafeInteger(Number(choice.value)) ||
      Number(choice.value) < 1
    ) {
      fieldErrors[key] = "Enter a whole column position starting at 1.";
      return undefined;
    }
    return { index: Number(choice.value) - 1 };
  }
  const date = read(draft.date, "date", true);
  const amount =
    draft.amountMode === "signed"
      ? {
          mode: "signed" as const,
          column: read(draft.amount, "amount", true),
          invertSign: draft.invertSign,
        }
      : {
          mode: "debit-credit" as const,
          debitColumn: read(draft.debit, "debit"),
          creditColumn: read(draft.credit, "credit"),
        };
  if (
    amount.mode === "debit-credit" &&
    !amount.debitColumn &&
    !amount.creditColumn
  )
    fieldErrors.debit = "Choose a debit or credit column.";
  const descriptions = draft.descriptions.map(({ id, column }) =>
    read(column, id, true),
  );
  const optionalMappings = {
    originalAmount: read(draft.originalAmount, "originalAmount"),
    originalCurrency: read(draft.originalCurrency, "originalCurrency"),
    exchangeRate: read(draft.exchangeRate, "exchangeRate"),
  };
  const formatErrors: string[] = [];
  if (
    !draft.delimiters.length ||
    draft.delimiters.some(
      (delimiter) => !delimiter || /[\r\n"\ufeff]/.test(delimiter),
    )
  )
    formatErrors.push(
      "Choose at least one valid delimiter; quotes and line breaks cannot be delimiters.",
    );
  if (
    draft.numberFormat.decimalSeparator ===
    draft.numberFormat.thousandsSeparator
  )
    formatErrors.push("Decimal and thousands separators must be different.");
  if (Object.keys(fieldErrors).length || formatErrors.length)
    return { format: null, fieldErrors, errors: formatErrors };
  const result = readStatementImportCsvFormat({
    hasHeader: draft.hasHeader,
    delimitersToGuess: draft.delimiters,
    dateFormat: draft.dateFormat,
    numberFormat: draft.numberFormat,
    mappings: {
      date,
      amount,
      ...optionalMappings,
      ...(descriptions.length
        ? { description: { columns: descriptions, separator: draft.separator } }
        : {}),
    },
  });
  return { format: result.format, fieldErrors, errors: result.errors };
}
