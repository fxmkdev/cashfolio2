import { afterEach, describe, expect, it, vi } from "vitest";
import { RESOURCE_LIMITS } from "../shared/resource-limits";
import { readBoundedRequest } from "./request-body.server";

function request(body: BodyInit, headers?: HeadersInit, signal?: AbortSignal) {
  return new Request("https://cashfolio.test/", {
    method: "POST",
    body,
    headers,
    signal,
    ...{ duplex: "half" },
  });
}
afterEach(() => vi.useRealTimers());
describe("request body boundary", () => {
  it("preserves bytes at the limit even without Content-Length", async () => {
    const result = await readBoundedRequest(
      request(new Uint8Array(RESOURCE_LIMITS.bodyBytes)),
    );
    expect(result).toBeInstanceOf(Request);
    expect((await result.arrayBuffer()).byteLength).toBe(
      RESOURCE_LIMITS.bodyBytes,
    );
  });
  it.each([undefined, { "content-length": "1" }])(
    "rejects streamed overflow regardless of declared length (%j)",
    async (headers) => {
      const cancel = vi.fn();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(RESOURCE_LIMITS.bodyBytes));
          controller.enqueue(new Uint8Array(1));
        },
        cancel,
      });
      const result = await readBoundedRequest(request(stream, headers));
      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(413);
      expect(cancel).toHaveBeenCalledOnce();
    },
  );
  it("preserves POST data and authorization headers from a structural server adapter", async () => {
    const incoming = request('{"name":"Book"}', {
      cookie: "session=opaque",
      origin: "https://cashfolio.test",
      "content-type": "application/json",
    });
    // srvx adapts the Fetch interface without Undici's native private fields.
    const adapted = Object.create(Request.prototype) as Request;
    for (const field of ["url", "method", "headers", "signal", "body"] as const)
      Object.defineProperty(adapted, field, { value: incoming[field] });
    expect(adapted).toBeInstanceOf(Request);
    const result = await readBoundedRequest(adapted);
    expect(result).toBeInstanceOf(Request);
    expect((result as Request).method).toBe("POST");
    expect((result as Request).url).toBe(incoming.url);
    expect((result as Request).headers.get("cookie")).toBe("session=opaque");
    expect((result as Request).headers.get("origin")).toBe(
      "https://cashfolio.test",
    );
    expect(await result.json()).toEqual({ name: "Book" });
  });
  it("rejects a declared oversized body without reading it", async () => {
    const cancel = vi.fn();
    const result = await readBoundedRequest(
      request(new ReadableStream({ cancel }), {
        "content-length": String(RESOURCE_LIMITS.bodyBytes + 1),
      }),
    );
    expect((result as Response).status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("cancels a slow body after ten seconds", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const result = readBoundedRequest(request(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(RESOURCE_LIMITS.bodyReadMs);
    expect(((await result) as Response).status).toBe(408);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("cancels a pending body when the client disconnects", async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const result = readBoundedRequest(
      request(new ReadableStream({ cancel }), undefined, controller.signal),
    );
    controller.abort();
    expect(((await result) as Response).status).toBe(408);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
