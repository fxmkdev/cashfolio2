import {
  type StatementImportCsvMappings,
  type StatementImportCsvAmountMapping,
  type StatementImportCsvDescriptionMapping,
  type StatementImportCsvColumnRef,
} from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readOptionalMappings(
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
