import { beforeEach, describe, expect, it, vi } from "vitest";
import { RESOURCE_LIMITS } from "./shared/resources/resource-limits";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<(request: Request) => Promise<Response>>(),
  logServerError: vi.fn(),
}));

vi.mock("@tanstack/react-start/server", () => ({
  createStartHandler: () => mocks.fetch,
  defaultStreamHandler: vi.fn(),
}));
vi.mock("./server/error-logging.server", () => ({
  installGlobalServerErrorLogging: vi.fn(),
  logServerError: mocks.logServerError,
  shouldLogServerRequestError: () => true,
}));

import server from "./server";

const request = (path: string) =>
  new Request(`https://app.example.test${path}`);

beforeEach(() => vi.resetAllMocks());

describe("server response cache policy", () => {
  it.each([
    ["/", "/api/logto/sign-in"],
    ["/?return=home", "/book-1/accounts"],
    ["/book-1/accounts", "/api/logto/sign-in"],
  ])("prevents caching the redirect from %s to %s", async (path, location) => {
    mocks.fetch.mockResolvedValue(
      new Response(null, { status: 307, headers: { location } }),
    );

    const response = await server.fetch(request(path));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(location);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([301, 302, 303, 307, 308])(
    "supports immutable headers on a %s redirect",
    async (status) => {
      const original = Response.redirect(
        "https://app.example.test/next",
        status,
      );
      mocks.fetch.mockResolvedValue(original);

      const response = await server.fetch(request("/legacy"));

      expect(response.status).toBe(status);
      expect(response.headers.get("location")).toBe(
        "https://app.example.test/next",
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(original.headers.has("cache-control")).toBe(false);
    },
  );

  it.each([
    ["/", 200],
    ["/?return=home", 503],
    ["/api/logto/sign-in", 302],
    ["/api/logto/sign-up", 302],
    ["/api/logto/callback?code=one-time-code", 302],
    ["/api/logto/callback", 400],
    ["/api/logto/sign-out", 405],
    ["/api/logto/unsupported", 404],
    ["/api/logto/sign-in", 500],
  ])("prevents caching %s responses with status %s", async (path, status) => {
    mocks.fetch.mockResolvedValue(
      new Response("original body", {
        status,
        statusText: "Original status",
        headers: { "cache-control": "public, max-age=3600" },
      }),
    );

    const response = await server.fetch(request(path));

    expect(response.status).toBe(status);
    expect(response.statusText).toBe("Original status");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("original body");
  });

  it("preserves separate session and legacy cookie headers", async () => {
    const cookies = [
      "__Host-cashfolio-session=new-session; Path=/; Secure; HttpOnly; SameSite=Lax",
      "logtoCookies=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly",
    ];
    const headers = new Headers({ location: "/" });
    for (const cookie of cookies) headers.append("Set-Cookie", cookie);
    mocks.fetch.mockResolvedValue(new Response(null, { status: 302, headers }));

    const response = await server.fetch(request("/api/logto/callback"));

    expect(response.headers.getSetCookie()).toEqual(cookies);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns streaming responses before the body completes", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    });
    mocks.fetch.mockResolvedValue(new Response(stream));

    const response = await server.fetch(request("/"));

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.bodyUsed).toBe(false);
    controller.enqueue(new TextEncoder().encode("streamed body"));
    controller.close();
    expect(await response.text()).toBe("streamed body");
  });

  it.each(["/api/logto/sign-out", "/?return=home"])(
    "prevents caching early request validation failures for %s",
    async (path) => {
      const response = await server.fetch(
        new Request(request(path), {
          method: "POST",
          headers: { "content-length": String(RESOURCE_LIMITS.bodyBytes + 1) },
          body: "oversized request",
        }),
      );

      expect(response.status).toBe(413);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe("Request body exceeds 5 MiB.");
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["/assets/app.js", 200, "public, max-age=31536000, immutable"],
    ["/book-1/accounts", 200, "private, no-cache"],
    ["/api/logto-other", 404, null],
    ["/assets/app.js", 304, "public, max-age=3600"],
  ])("preserves unrelated %s response caching", async (path, status, cache) => {
    mocks.fetch.mockResolvedValue(
      new Response(null, {
        status,
        headers: cache ? { "cache-control": cache } : undefined,
      }),
    );

    const response = await server.fetch(request(path));

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe(cache);
  });

  it("preserves request failure logging and propagation", async () => {
    const failure = new Error("handler unavailable");
    mocks.fetch.mockRejectedValue(failure);

    await expect(server.fetch(request("/"))).rejects.toBe(failure);
    expect(mocks.logServerError).toHaveBeenCalledWith(
      "Server request failed.",
      failure,
      { requestMethod: "GET", requestUrl: "https://app.example.test/" },
    );
  });
});
