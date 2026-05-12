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

  return value;
}
