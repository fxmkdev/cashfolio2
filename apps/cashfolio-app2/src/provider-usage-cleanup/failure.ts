const FAILURE_REASONS = [
  "connection-failed",
  "authentication-failed",
  "permission-denied",
  "schema-missing",
  "transaction-failed",
  "query-timeout",
  "deadline-exceeded",
  "unknown",
] as const;

export type CleanupFailureReason = (typeof FAILURE_REASONS)[number];

export function isCleanupFailureReason(
  value: unknown,
): value is CleanupFailureReason {
  return FAILURE_REASONS.some((reason) => reason === value);
}

const REASON_BY_CODE = new Map<string, CleanupFailureReason>([
  ["P1000", "authentication-failed"],
  ["28P01", "authentication-failed"],
  ["28000", "authentication-failed"],
  ["P1001", "connection-failed"],
  ["P1002", "connection-failed"],
  ["P1011", "connection-failed"],
  ["ECONNREFUSED", "connection-failed"],
  ["ECONNRESET", "connection-failed"],
  ["ETIMEDOUT", "connection-failed"],
  ["ENOTFOUND", "connection-failed"],
  ["P1010", "permission-denied"],
  ["42501", "permission-denied"],
  ["P2021", "schema-missing"],
  ["42P01", "schema-missing"],
  ["P2028", "transaction-failed"],
  ["57014", "query-timeout"],
  ["55P03", "query-timeout"],
]);

/** Only emit fixed categories; driver messages and metadata can contain secrets. */
export function getCleanupFailureReason(error: unknown): CleanupFailureReason {
  function inspect(value: unknown, depth: number): CleanupFailureReason {
    if (!value || typeof value !== "object" || depth === 0) return "unknown";
    const fields = value as Record<string, unknown>;
    for (const key of ["code", "originalCode"]) {
      const code = fields[key];
      const reason = typeof code === "string" && REASON_BY_CODE.get(code);
      if (reason) return reason;
    }
    // Prisma wraps PostgreSQL errors in meta.driverAdapterError.cause.
    for (const key of ["meta", "driverAdapterError", "cause"]) {
      const reason = inspect(fields[key], depth - 1);
      if (reason !== "unknown") return reason;
    }
    return "unknown";
  }
  return inspect(error, 5);
}
