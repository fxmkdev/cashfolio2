import { parseExplicitPeriodSelectionFromUnknown } from "../shared/period";
import {
  assertRecord,
  optionalField,
  requireStringField,
} from "./input-validation";
import { parseLedgerAccountContextFromInput } from "./ledger-account-context";
import {
  readAccountBookInput,
  readAccountInput,
} from "./read-input-validation";

// Keep the existing transport's string boolean representation supported.
function readLedgerFlag(data: Record<string, unknown>, field: string) {
  const value = data[field];
  if (value === undefined || value === false || value === "false") return false;
  if (value === true || value === "true") return true;
  throw new Error(`${field} must be true or false.`);
}

export function readLedgerInput(data: unknown) {
  assertRecord(data);
  return {
    ...readAccountInput(data),
    period: parseExplicitPeriodSelectionFromUnknown(data.period),
    includeReferenceValues: readLedgerFlag(data, "includeReferenceValues"),
    includeFirstBookingDate: readLedgerFlag(data, "includeFirstBookingDate"),
    // Optional client hints retain their existing database-verified fallback.
    accountContext: parseLedgerAccountContextFromInput(data),
  };
}

export function readLedgerPeriodBoundsInput(data: unknown) {
  assertRecord(data);
  return {
    ...readAccountBookInput(data),
    accountId: optionalField(data, "accountId", requireStringField),
  };
}
