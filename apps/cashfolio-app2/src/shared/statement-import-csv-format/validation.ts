import {
  type StatementImportCsvMappings,
  type StatementImportCsvNumberFormat,
} from "./types";
import { collectColumnRefs, isHeaderRef, getColumnRefIndex } from "./columns";

export function validateMappings(
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

export function validateNumberFormat(
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
