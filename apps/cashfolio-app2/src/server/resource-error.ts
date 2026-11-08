import { ResourceLimitError } from "../shared/resources/resource-error";
export { ResourceLimitError };

export function rethrowResourceError(error: unknown) {
  if (error instanceof ResourceLimitError) throw error;
}
