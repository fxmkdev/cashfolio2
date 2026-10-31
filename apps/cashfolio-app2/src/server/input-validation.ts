import { RESOURCE_LIMITS, assertLength } from "../shared/resource-limits";

export function assertRecord(
  value: unknown,
  message = "Input must be an object.",
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }
}

export function requireStringField<TField extends string>(
  data: Record<string, unknown>,
  field: TField,
  message = `${field} is required.`,
): string {
  const value = data[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }

  assertLength(
    value,
    field === "name" || field === "confirmationName" || field === "confirmation"
      ? RESOURCE_LIMITS.name
      : ["currency", "cryptocurrency", "symbol", "tradeCurrency"].includes(
            field,
          )
        ? RESOURCE_LIMITS.unitCode
        : RESOURCE_LIMITS.identifier,
    field,
  );
  return value;
}

export function requireNumberField<TField extends string>(
  data: Record<string, unknown>,
  field: TField,
  message = `${field} is required.`,
): number {
  const value = data[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(message);
  }

  return value;
}

export function requireArrayField<TField extends string>(
  data: Record<string, unknown>,
  field: TField,
  message = `${field} is required.`,
): unknown[] {
  const value = data[field];
  if (!Array.isArray(value)) {
    throw new Error(message);
  }

  assertLength(value, RESOURCE_LIMITS.bulkItems, field);
  return value;
}

// Descriptions may be empty; identifiers and names use requireStringField.
export function requireTextField(
  data: Record<string, unknown>,
  field: string,
): string {
  const value = data[field];
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  assertLength(
    value,
    field === "description"
      ? RESOURCE_LIMITS.description
      : RESOURCE_LIMITS.unitCode,
    field,
  );
  return value;
}

export function requireEnumField<T extends string>(
  data: Record<string, unknown>,
  field: string,
  values: readonly T[],
  message = `${field} is invalid.`,
): T {
  const value = values.find((candidate) => candidate === data[field]);
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

export function requireIntegerField(
  data: Record<string, unknown>,
  field: string,
): number {
  const value = requireNumberField(data, field);
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
    throw new Error(`${field} must be a 32-bit integer.`);
  }
  return value;
}

export function optionalField<T>(
  data: Record<string, unknown>,
  field: string,
  read: (data: Record<string, unknown>, field: string) => T,
): T | undefined {
  return data[field] === undefined ? undefined : read(data, field);
}

export function nullableOptionalField<T>(
  data: Record<string, unknown>,
  field: string,
  read: (data: Record<string, unknown>, field: string) => T,
): T | null | undefined {
  return data[field] === null ? null : optionalField(data, field, read);
}

export function requireBooleanField(
  data: Record<string, unknown>,
  field: string,
): boolean {
  const value = data[field];
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be true or false.`);
  }
  return value;
}
