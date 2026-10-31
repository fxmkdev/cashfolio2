export const RESOURCE_ERROR_HEADER = "X-Cashfolio-Resource-Limit";
export const RESOURCE_ERROR_CODES = [
  "unknown",
  "provider_request_limit",
  "read_deadline",
  "cancelled",
  "history_revision_changed",
] as const;
export type ResourceErrorCode = (typeof RESOURCE_ERROR_CODES)[number];

export class ResourceLimitError extends Error {
  constructor(
    message: string,
    public readonly status = 429,
    public readonly retryAfter = 1,
    public readonly code: ResourceErrorCode = "unknown",
  ) {
    super(message);
    this.name = "ResourceLimitError";
  }
}
