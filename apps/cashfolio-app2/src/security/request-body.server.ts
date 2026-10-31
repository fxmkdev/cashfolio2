import { RESOURCE_LIMITS } from "../shared/resource-limits";

/** Bound bytes before Start/Seroval parses them, including chunked requests. */
export async function readBoundedRequest(
  request: Request,
): Promise<Request | Response> {
  if (!request.body) return request;
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > RESOURCE_LIMITS.bodyBytes) {
    void request.body.cancel().catch(() => {});
    return new Response("Request body exceeds 5 MiB.", { status: 413 });
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timedOut = false;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  const timer = setTimeout(() => {
    timedOut = true;
    cancel();
  }, RESOURCE_LIMITS.bodyReadMs);
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    if (request.signal.aborted)
      return new Response("Request cancelled.", { status: 408 });
    while (true) {
      const chunk = await reader.read();
      if (timedOut || request.signal.aborted)
        return new Response("Request body timed out or was cancelled.", {
          status: 408,
        });
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > RESOURCE_LIMITS.bodyBytes) {
        cancel();
        return new Response("Request body exceeds 5 MiB.", { status: 413 });
      }
      chunks.push(chunk.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    // Nitro/srvx requests expose the Fetch API but may not carry Undici's
    // private Request state (notably when MSW intercepts the constructor).
    // Copy the incoming HTTP fields instead of cloning the adapter instance.
    return new Request(request.url, {
      method: request.method,
      headers: request.headers,
      signal: request.signal,
      body,
    });
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
