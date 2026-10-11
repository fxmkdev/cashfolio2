import Papa from "papaparse";
import { createStatementImportDraft } from "../draft";
import {
  type CurrentAccountForStatementImport,
  type StatementImportDraft,
  type StatementImportParseResult,
} from "../types";
import { type StatementImportCsvFormat } from "@/shared/statement-import-csv-format";
import {
  collectColumnRefs,
  createHeaderIndex,
  getColumnValue,
  getMinimumColumnCount,
  getMissingCsvShapeMessage,
  normalizeStatementImportCsvFormat,
  shouldRejectLikelyHeaderlessFirstRow,
  validateMappedHeaders,
  type HeaderIndex,
  type NormalizedStatementImportCsvFormat,
} from "./format";
import {
  isLikelyHeaderlessDataRow,
  toStatementImportCsvRow,
} from "./normalize";
import { validateCsvRow, validateCsvRowShape } from "./validate";

type ParsedCsvDataRow = {
  row: string[];
  sourceRowNumber: number;
};

export function parseStatementImportCsv(args: {
  text: string;
  currentAccount: CurrentAccountForStatementImport;
  format: StatementImportCsvFormat;
}): StatementImportParseResult {
  const formatResult = normalizeStatementImportCsvFormat(args.format);
  if (formatResult.errors.length > 0) {
    return { drafts: [], errors: formatResult.errors };
  }

  const format = formatResult.format;
  const minimumColumnCount = getMinimumColumnCount(format);
  const parsed = parseCsvText(args.text, format);
  const errors = getParseErrors(parsed.errors);
  const [firstRow, ...remainingRows] = parsed.data;
  if (!firstRow) {
    errors.unshift(getMissingCsvShapeMessage(format, minimumColumnCount));
    return { drafts: [], errors };
  }

  const headerResult = getHeaderResult({
    firstRow,
    format,
    minimumColumnCount,
  });
  if (headerResult.errors.length > 0) {
    return { drafts: [], errors: [...errors, ...headerResult.errors] };
  }

  const dataRows = getDataRows({
    format,
    parsedRows: parsed.data,
    remainingRows,
  });
  const rows = dataRows.filter(({ row }) =>
    rowHasMappedValues(
      row,
      format,
      headerResult.headerIndex,
      minimumColumnCount,
    ),
  );
  if (rows.length === 0) {
    errors.push("CSV must contain at least one transaction row.");
  }

  const drafts = parseDrafts({
    rows,
    format,
    headerRow: headerResult.headerRow,
    headerIndex: headerResult.headerIndex,
    delimiter: parsed.meta.delimiter,
    minimumColumnCount,
    currentAccount: args.currentAccount,
    errors,
  });

  return errors.length > 0 ? { drafts: [], errors } : { drafts, errors: [] };
}

function parseCsvText(
  text: string,
  format: NormalizedStatementImportCsvFormat,
) {
  return Papa.parse<string[]>(text, {
    header: false,
    delimitersToGuess: [...format.delimitersToGuess],
    skipEmptyLines: "greedy",
  });
}

function getParseErrors(errors: Papa.ParseError[]): string[] {
  return errors.map((error) =>
    error.row != null
      ? `Row ${error.row + 1}: ${error.message}`
      : error.message,
  );
}

function getHeaderResult(args: {
  firstRow: string[];
  format: NormalizedStatementImportCsvFormat;
  minimumColumnCount: number;
}): {
  headerRow: string[] | undefined;
  headerIndex: HeaderIndex | undefined;
  errors: string[];
} {
  const { firstRow, format, minimumColumnCount } = args;
  if (!format.hasHeader) {
    return {
      headerRow: undefined,
      headerIndex: undefined,
      errors:
        firstRow.length < minimumColumnCount
          ? [getMissingCsvShapeMessage(format, minimumColumnCount)]
          : [],
    };
  }

  if (firstRow.length < minimumColumnCount) {
    return {
      headerRow: firstRow,
      headerIndex: undefined,
      errors: [getMissingCsvShapeMessage(format, minimumColumnCount)],
    };
  }
  if (
    shouldRejectLikelyHeaderlessFirstRow(format) &&
    isLikelyHeaderlessDataRow(firstRow, format, undefined)
  ) {
    return {
      headerRow: firstRow,
      headerIndex: undefined,
      errors: ["CSV must include a header row before transaction rows."],
    };
  }

  const headerIndex = createHeaderIndex(firstRow);
  return {
    headerRow: firstRow,
    headerIndex,
    errors: validateMappedHeaders(format, headerIndex),
  };
}

function getDataRows(args: {
  format: NormalizedStatementImportCsvFormat;
  parsedRows: string[][];
  remainingRows: string[][];
}): ParsedCsvDataRow[] {
  return args.format.hasHeader
    ? args.remainingRows.map((row, index) => ({
        row,
        sourceRowNumber: index + 2,
      }))
    : args.parsedRows.map((row, index) => ({
        row,
        sourceRowNumber: index + 1,
      }));
}

function rowHasMappedValues(
  row: string[],
  format: NormalizedStatementImportCsvFormat,
  headerIndex: HeaderIndex | undefined,
  minimumColumnCount: number,
): boolean {
  if (format.orderedColumns) {
    return row
      .slice(0, minimumColumnCount)
      .some((value) => value?.trim() !== "");
  }

  return collectColumnRefs(format.mappings).some(
    (ref) => getColumnValue(row, ref, headerIndex).trim() !== "",
  );
}

function parseDrafts(args: {
  rows: ParsedCsvDataRow[];
  format: NormalizedStatementImportCsvFormat;
  headerRow: string[] | undefined;
  headerIndex: HeaderIndex | undefined;
  delimiter: string;
  minimumColumnCount: number;
  currentAccount: CurrentAccountForStatementImport;
  errors: string[];
}): StatementImportDraft[] {
  const drafts: StatementImportDraft[] = [];
  args.rows.forEach(({ row, sourceRowNumber }) => {
    const rowShapeErrors = validateCsvRowShape({
      row,
      headerColumnCount: args.headerRow?.length,
      headerIndex: args.headerIndex,
      delimiter: args.delimiter,
      format: args.format,
      minimumColumnCount: args.minimumColumnCount,
      sourceRowNumber,
    });
    if (rowShapeErrors.length > 0) {
      args.errors.push(...rowShapeErrors);
      return;
    }

    const csvRowResult = toStatementImportCsvRow({
      row,
      format: args.format,
      headerIndex: args.headerIndex,
      sourceRowNumber,
    });
    if (csvRowResult.errors.length > 0) {
      args.errors.push(...csvRowResult.errors);
      return;
    }

    const rowErrors = validateCsvRow(csvRowResult.row, sourceRowNumber);
    if (rowErrors.length > 0) {
      args.errors.push(...rowErrors);
      return;
    }

    drafts.push(
      createStatementImportDraft({
        row: csvRowResult.row,
        sourceRowNumber,
        currentAccount: args.currentAccount,
      }),
    );
  });

  return drafts;
}
