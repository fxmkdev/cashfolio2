import { describe, expect, it } from "vitest";
import {
  serializeServerError,
  shouldLogServerRequestError,
} from "./error-logging.server";

describe("serializeServerError", () => {
  it("serializes Response rejections with status, safe headers, and body text", async () => {
    const response = new Response("Forbidden token=super-secret", {
      status: 403,
      statusText: "Forbidden",
      headers: {
        authorization: "Bearer super-secret",
        "content-type": "text/plain",
        "set-cookie": "session=super-secret",
        "x-request-id": "request-1",
      },
    });

    await expect(serializeServerError(response)).resolves.toMatchObject({
      type: "Response",
      status: 403,
      statusText: "Forbidden",
      url: "",
      redirected: false,
      bodyUsed: false,
      headers: {
        authorization: "[redacted]",
        "content-type": "text/plain",
        "set-cookie": "[redacted]",
        "x-request-id": "request-1",
      },
      bodyText: "Forbidden token=[redacted]",
    });
  });

  it("serializes Error values with code and cause", async () => {
    const cause = new Response("Missing", { status: 404 });
    const error = new Error("Startup failed", { cause });
    Object.assign(error, { code: "E_STARTUP" });

    await expect(serializeServerError(error)).resolves.toMatchObject({
      type: "Error",
      name: "Error",
      message: "Startup failed",
      code: "E_STARTUP",
      cause: {
        type: "Response",
        status: 404,
        bodyText: "Missing",
      },
    });
  });

  it("serializes redirect-like plain objects and redacts sensitive fields", async () => {
    const redirectLike = {
      href: "/api/logto/sign-in",
      isRedirect: true,
      statusCode: 302,
      token: "super-secret",
      headers: {
        location: "/api/logto/sign-in",
        cookie: "session=super-secret",
      },
    };

    await expect(serializeServerError(redirectLike)).resolves.toMatchObject({
      type: "Object",
      href: "/api/logto/sign-in",
      isRedirect: true,
      statusCode: 302,
      token: "[redacted]",
      headers: {
        type: "Object",
        location: "/api/logto/sign-in",
        cookie: "[redacted]",
      },
    });
  });

  it("redacts sensitive JSON body fields", async () => {
    const response = new Response(
      JSON.stringify({
        message: "Failed",
        sessionSecret: "super-secret",
      }),
      {
        headers: { "content-type": "application/json" },
      },
    );

    const payload = await serializeServerError(response);

    expect(payload).toMatchObject({
      bodyText: '{"message":"Failed","sessionSecret":"[redacted]"}',
    });
  });

  it("uses a clear marker for already-consumed Response bodies", async () => {
    const response = new Response("Already read", { status: 500 });
    await response.text();

    await expect(serializeServerError(response)).resolves.toMatchObject({
      type: "Response",
      status: 500,
      bodyUsed: true,
      bodyText: "[body-used]",
    });
  });

  it("reads only a bounded Response body preview", async () => {
    const response = new Response("x".repeat(5_000), { status: 500 });

    const payload = await serializeServerError(response);

    expect(payload).toMatchObject({
      type: "Response",
      status: 500,
    });
    expect(String((payload as { bodyText: unknown }).bodyText)).toHaveLength(
      4_015,
    );
    expect(String((payload as { bodyText: unknown }).bodyText)).toMatch(
      /\.\.\. \[truncated\]$/,
    );
  });
});

describe("shouldLogServerRequestError", () => {
  it("skips expected redirects and non-5xx Response values", () => {
    expect(
      shouldLogServerRequestError(new Response(null, { status: 404 })),
    ).toBe(false);
    expect(
      shouldLogServerRequestError({
        isRedirect: true,
        statusCode: 302,
        href: "/api/logto/sign-in",
      }),
    ).toBe(false);
  });

  it("logs server failures and unknown thrown values", () => {
    expect(
      shouldLogServerRequestError(new Response(null, { status: 500 })),
    ).toBe(true);
    expect(shouldLogServerRequestError({ statusCode: 503 })).toBe(true);
    expect(shouldLogServerRequestError(new Error("boom"))).toBe(true);
  });
});
