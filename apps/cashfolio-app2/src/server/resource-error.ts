import { ResourceLimitError } from "../shared/resource-error";
export { ResourceLimitError };

export function rethrowResourceError(error: unknown) {
  if (error instanceof ResourceLimitError) throw error;
}
