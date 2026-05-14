import { currencies } from "../currencies";
import { normalizeDateInputValue, startOfUtcDay } from "../shared/date";

export function normalizeAccountBookNameOrThrow(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Account book name is required.");
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error("Account book name is required.");
  }

  return normalized;
}

export function normalizeReferenceCurrencyOrThrow(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Reference currency is required.");
  }

  const normalized = value.trim().toUpperCase();
  if (normalized.length === 0) {
    throw new Error("Reference currency is required.");
  }

  if (!Object.prototype.hasOwnProperty.call(currencies, normalized)) {
    throw new Error("Reference currency is invalid.");
  }

  return normalized;
}

export function normalizeStartDateOrThrow(value: unknown): Date {
  if (value == null) {
    throw new Error("Start date is required.");
  }

  if (typeof value === "string" && value.trim().length === 0) {
    throw new Error("Start date is required.");
  }

  const normalizedInput =
    value instanceof Date || typeof value === "string" ? value : null;
  const parsed = normalizeDateInputValue(normalizedInput);
  if (!parsed) {
    throw new Error("Start date is invalid.");
  }

  const startDate = startOfUtcDay(parsed);
  const today = startOfUtcDay(new Date());
  if (startDate > today) {
    throw new Error("Start date cannot be in the future.");
  }

  return startDate;
}
