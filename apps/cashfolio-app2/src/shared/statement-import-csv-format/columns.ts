import {
  type StatementImportCsvMappings,
  type StatementImportCsvColumnRef,
  type StatementImportCsvDescriptionMapping,
  type NormalizedStatementImportCsvFormat,
  type HeaderIndex,
} from "./types";

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

export function getColumnRefIndex(
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
