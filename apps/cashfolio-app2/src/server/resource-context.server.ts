import { ResourceLimitError } from "./resource-error";
import { RESOURCE_ERROR_HEADER } from "../shared/resource-error";
import {
  checkResourceBudget,
  closeResourceContext,
  createResourceContext,
  resourceStorage as storage,
} from "./resource-scope.server";
export {
  bindResourceUser,
  checkResourceBudget,
  consumeProviderAttempt,
  createRequestScopedInFlightMap,
  failResourceRequest,
  getResourceSignal,
  isSharedResourceWork,
  reuseResourceRequestWork,
  startReadBudget,
} from "./resource-scope.server";
export { createUserScopedSharedWork } from "./shared-resource-work.server";

function errorResponse(error: ResourceLimitError) {
  console.warn("Resource budget rejected.", {
    status: error.status,
    category: error.code,
  });
  return new Response(error.message, {
    status: error.status,
    headers: {
      "Retry-After": String(error.retryAfter),
      [RESOURCE_ERROR_HEADER]: error.code,
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function withResourceRequest(
  signal: AbortSignal,
  operation: () => Promise<Response> | Response,
): Promise<Response> {
  const context = createResourceContext("request");
  return storage.run(context, async () => {
    const close = (reason: unknown = new Error("Request has finished.")) => {
      if (context.closed) return;
      signal.removeEventListener("abort", cancel);
      context.controller.signal.removeEventListener("abort", closeOnAbort);
      closeResourceContext(context, reason);
    };
    const closeOnAbort = () => close(context.controller.signal.reason);
    const cancel = () =>
      close(
        new ResourceLimitError(
          "The request was cancelled. Please try again.",
          503,
          5,
          "cancelled",
        ),
      );
    context.controller.signal.addEventListener("abort", closeOnAbort, {
      once: true,
    });
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    try {
      checkResourceBudget();
      const response = await operation();
      checkResourceBudget();
      if (!response.body) {
        close();
        return response;
      }
      const reader = response.body.getReader();
      return new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const chunk = await storage.run(context, () => reader.read());
              storage.run(context, checkResourceBudget);
              if (chunk.done) {
                close();
                controller.close();
              } else controller.enqueue(chunk.value);
            } catch (error) {
              close(error);
              await reader.cancel().catch(() => {});
              controller.error(error);
            }
          },
          async cancel(reason) {
            close(reason ?? new Error("Response was cancelled."));
            await reader.cancel(reason);
          },
        }),
        {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        },
      );
    } catch (error) {
      close(error);
      if (context.failure) return errorResponse(context.failure);
      if (error instanceof ResourceLimitError) return errorResponse(error);
      throw error;
    }
  });
}
