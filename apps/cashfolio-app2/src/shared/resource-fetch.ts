import {
  RESOURCE_ERROR_CODES,
  RESOURCE_ERROR_HEADER,
  ResourceLimitError,
  type ResourceErrorCode,
} from "./resource-error";

/** Preserve structured transport errors before the RPC serializer reads them. */
export const fetchWithResourceErrors: typeof fetch = async (input, init) => {
  const response = await globalThis.fetch(input, init);
  const code = response.headers.get(RESOURCE_ERROR_HEADER);
  const retryAfter = Number(response.headers.get("Retry-After"));
  if (
    !response.ok &&
    code &&
    RESOURCE_ERROR_CODES.includes(code as ResourceErrorCode) &&
    Number.isSafeInteger(retryAfter) &&
    retryAfter >= 0
  ) {
    throw new ResourceLimitError(
      await response.text(),
      response.status,
      retryAfter,
      code as ResourceErrorCode,
    );
  }
  return response;
};
