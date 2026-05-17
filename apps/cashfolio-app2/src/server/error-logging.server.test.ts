import { describe, expect, it } from "vitest";
import { serializeServerError } from "./error-logging.server";

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
});
