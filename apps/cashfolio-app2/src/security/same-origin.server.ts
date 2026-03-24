import { getRequest } from "@tanstack/react-start/server";

function resolveExpectedOrigin(baseUrl?: string): string {
  const resolvedBaseUrl = baseUrl ?? process.env.BASE_URL;

  if (!resolvedBaseUrl) {
    throw new Error("BASE_URL must be set");
  }

  return new URL(resolvedBaseUrl).origin;
}

export function ensureSameOriginRequest(
  request: Request,
  options?: { baseUrl?: string },
) {
  const expectedOrigin = resolveExpectedOrigin(options?.baseUrl);
  const requestOrigin = request.headers.get("origin");

  if (requestOrigin) {
    if (requestOrigin !== expectedOrigin) {
      throw new Response("Forbidden", { status: 403 });
    }
    return;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    throw new Response("Forbidden", { status: 403 });
  }

  let refererOrigin = "";
  try {
    refererOrigin = new URL(referer).origin;
  } catch {
    throw new Response("Forbidden", { status: 403 });
  }

  if (refererOrigin !== expectedOrigin) {
    throw new Response("Forbidden", { status: 403 });
  }
}

export function ensureSameOriginRequestFromServerContext(options?: {
  baseUrl?: string;
}) {
  ensureSameOriginRequest(getRequest(), options);
}
