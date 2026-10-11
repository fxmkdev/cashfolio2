import { type StatementImportCsvNumberFormat } from "@/shared/statement-import-csv-format";

export const STRICT_DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function normalizeNumberValue(args: {
  value: string;
  field: string;
  numberFormat: StatementImportCsvNumberFormat;
  sourceRowNumber: number;
  required: boolean;
}): { value: string; errors: string[] } {
  const trimmed = args.value.trim();
  if (!trimmed && !args.required) {
    return { value: "", errors: [] };
  }

  const normalized = normalizeNumberText(trimmed, args.numberFormat);
  if (!normalized || !STRICT_DECIMAL_PATTERN.test(normalized)) {
    return {
      value: normalized ?? trimmed,
      errors: [
        `Row ${args.sourceRowNumber}: ${args.field} must be a valid number.`,
      ],
    };
  }

  const number = Number(normalized);
  if (!Number.isFinite(number)) {
    return {
      value: normalized,
      errors: [`Row ${args.sourceRowNumber}: ${args.field} must be finite.`],
    };
  }

  return { value: normalized, errors: [] };
}

function normalizeNumberText(
  value: string,
  format: StatementImportCsvNumberFormat,
): string | null {
  let normalized = value.replace(/\u00a0/g, " ").trim();
  const thousandsSeparator = format.thousandsSeparator;
  if (thousandsSeparator) {
    normalized = normalized.split(thousandsSeparator).join("");
  }

  if (format.decimalSeparator === ",") {
    if (normalized.includes(".")) {
      return null;
    }
    normalized = normalized.replace(",", ".");
  } else if ((normalized.match(/\./g) ?? []).length > 1) {
    return null;
  }

  if ((normalized.match(/,/g) ?? []).length > 0) {
    return null;
  }

  return normalized;
}

export function toAbsoluteCanonicalNumberText(value: string): string {
  return value.startsWith("-") ? value.slice(1) : value;
}

export function negateCanonicalNumberText(value: string): string {
  const absoluteValue = toAbsoluteCanonicalNumberText(value);
  return Number(absoluteValue) === 0 ? "0" : `-${absoluteValue}`;
}

export function invertCanonicalNumberText(value: string): string {
  return value.startsWith("-")
    ? toAbsoluteCanonicalNumberText(value)
    : negateCanonicalNumberText(value);
}
