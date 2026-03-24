import { describe, expect, test } from "vitest";
import { ensureSameOriginRequest } from "./same-origin.server";

const BASE_URL = "https://cashfolio.example";

function createRequest(options?: {
  origin?: string;
  referer?: string;
}): Request {
  const headers = new Headers();
  if (options?.origin) {
    headers.set("origin", options.origin);
  }
  if (options?.referer) {
    headers.set("referer", options.referer);
  }

  return new Request(`${BASE_URL}/server-fn`, {
    method: "POST",
    headers,
  });
}

function expectForbidden(request: Request) {
  try {
    ensureSameOriginRequest(request, { baseUrl: BASE_URL });
    throw new Error("Expected ensureSameOriginRequest to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(403);
  }
}

describe("ensureSameOriginRequest", () => {
  test("accepts request when Origin matches expected origin", () => {
    const request = createRequest({ origin: BASE_URL });
    expect(() =>
      ensureSameOriginRequest(request, { baseUrl: BASE_URL }),
    ).not.toThrow();
  });

  test("accepts request when Referer matches expected origin and Origin is missing", () => {
    const request = createRequest({
      referer: `${BASE_URL}/accounts?tab=ASSET`,
    });
    expect(() =>
      ensureSameOriginRequest(request, { baseUrl: BASE_URL }),
    ).not.toThrow();
  });

  test("rejects request when Origin does not match expected origin", () => {
    const request = createRequest({ origin: "https://attacker.example" });
    expectForbidden(request);
  });

  test("rejects request when both Origin and Referer are missing", () => {
    const request = createRequest();
    expectForbidden(request);
  });
});
