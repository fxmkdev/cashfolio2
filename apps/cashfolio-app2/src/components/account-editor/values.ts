import {
  type AccountInitialValuesSource,
  type AccountInitialValues,
  type FormValues,
  type AccountTypeDescriptor,
  type TransformedFormValues,
} from "./types";
import {
  AccountType,
  Unit,
  EquityAccountSubtype,
} from "../../.prisma-client/enums";
import { parseStatementImportCsvFormatJson } from "@/shared/statement-import-csv-format";

export function createAccountInitialValues(
  source: AccountInitialValuesSource,
): AccountInitialValues {
  return {
    name: source.name,
    assetClassId: source.assetClassId ?? null,
    trackingMethod: source.trackingMethod ?? "INDIVIDUAL_UNITS",

    type: source.type,
    equityAccountSubtype: source.equityAccountSubtype,
    groupId: source.groupId ?? undefined,
    sortOrder: source.sortOrder ?? undefined,
    unit: source.unit,
    currency: source.currency,
    cryptocurrency: source.cryptocurrency,
    symbol: source.symbol,
    tradeCurrency: source.tradeCurrency,
    statementImportCsvFormat: source.statementImportCsvFormat ?? null,
    isCashAccount: source.isCashAccount ?? false,
    openingBalance: source.openingBalance,
  };
}

export function toFormValues(initial: AccountInitialValues): FormValues {
  const typeDescriptor: FormValues["typeDescriptor"] =
    initial.type === AccountType.EQUITY && initial.equityAccountSubtype
      ? `${AccountType.EQUITY}-${initial.equityAccountSubtype}`
      : (initial.type as "BALANCE");

  return {
    name: initial.name,
    assetClassId: initial.assetClassId ?? null,
    trackingMethod: initial.trackingMethod ?? "INDIVIDUAL_UNITS",

    typeDescriptor,
    groupId: initial.groupId ?? undefined,
    sortOrder: initial.sortOrder ?? undefined,
    openingBalance: initial.openingBalance ?? undefined,
    unit: initial.unit ?? Unit.CURRENCY,
    currency: initial.currency ?? undefined,
    cryptocurrency: initial.cryptocurrency ?? undefined,
    symbol: initial.symbol ?? undefined,
    tradeCurrency: initial.tradeCurrency ?? undefined,
    statementImportCsvFormat: initial.statementImportCsvFormat
      ? JSON.stringify(initial.statementImportCsvFormat, null, 2)
      : undefined,
    isCashAccount: initial.isCashAccount ?? false,
  };
}

export function validateStatementImportCsvFormatFormValue(
  value: string | undefined,
  typeDescriptor?: AccountTypeDescriptor,
): string | null {
  if (typeDescriptor !== AccountType.BALANCE) {
    return null;
  }

  return parseStatementImportCsvFormatJson(value).errors[0] ?? null;
}

export function transformAccountValues(
  values: FormValues,
): TransformedFormValues {
  const [type, equityAccountSubtype] = (values.typeDescriptor?.split("-") ??
    []) as [AccountType, EquityAccountSubtype?];
  const openingBalance =
    values.openingBalance == null || values.openingBalance === ""
      ? null
      : Number(values.openingBalance);
  const transformed = {
    ...values,
    type,
    assetClassId: values.assetClassId || null,
    trackingMethod:
      type === AccountType.BALANCE && values.unit === Unit.CURRENCY
        ? (values.trackingMethod ?? "INDIVIDUAL_UNITS")
        : ("INDIVIDUAL_UNITS" as const),

    openingBalance,
    statementImportCsvFormat: parseStatementImportCsvFormatJson(
      values.statementImportCsvFormat,
    ).format,
    ...(type === AccountType.EQUITY ? { equityAccountSubtype } : undefined),
  };

  if (type === AccountType.EQUITY) {
    return {
      ...transformed,
      assetClassId: null,
      unit: undefined,
      currency: undefined,
      cryptocurrency: undefined,
      symbol: undefined,
      tradeCurrency: undefined,
      statementImportCsvFormat: null,
      isCashAccount: false,
    };
  }

  return {
    ...transformed,
    isCashAccount:
      type === AccountType.BALANCE && values.unit === Unit.CURRENCY
        ? (values.isCashAccount ?? false)
        : false,
  };
}
