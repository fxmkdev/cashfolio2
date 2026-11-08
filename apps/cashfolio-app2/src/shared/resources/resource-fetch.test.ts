import { afterEach, expect, it, vi } from "vitest";
import { fetchWithResourceErrors } from "./resource-fetch";
import { RESOURCE_ERROR_HEADER, ResourceLimitError } from "./resource-error";
afterEach(() => vi.unstubAllGlobals());
it("reads machine codes and retry intervals without message matching", async () => {
  const signal = new AbortController().signal;
  const wire = vi.fn().mockResolvedValue(
    new Response("any translated message", {
      status: 429,
      headers: {
        [RESOURCE_ERROR_HEADER]: "provider_request_limit",
        "Retry-After": "19",
      },
    }),
  );
  vi.stubGlobal("fetch", wire);
  await expect(
    fetchWithResourceErrors("https://example.test", { signal }),
  ).rejects.toMatchObject({
    code: "provider_request_limit",
    retryAfter: 19,
    status: 429,
  });
  expect(wire).toHaveBeenCalledWith("https://example.test", { signal });
});
it.each([undefined, "unknown-future-code"])(
  "leaves unclassified responses to the RPC client (%s)",
  async (code) => {
    const headers = code ? { [RESOURCE_ERROR_HEADER]: code } : undefined;
    const response = new Response("too many provider requests", {
      status: 429,
      headers,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    expect(await fetchWithResourceErrors("https://example.test")).toBe(
      response,
    );
    expect(await response.text()).toBe("too many provider requests");
  },
);
it("does not consume successful RPC response bodies", async () => {
  const response = new Response("RPC data");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  expect(
    await (await fetchWithResourceErrors("https://example.test")).text(),
  ).toBe("RPC data");
});
it("propagates network and cancellation errors unchanged", async () => {
  const error = new DOMException("Aborted", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
  await expect(fetchWithResourceErrors("https://example.test")).rejects.toBe(
    error,
  );
  expect(error).not.toBeInstanceOf(ResourceLimitError);
});
