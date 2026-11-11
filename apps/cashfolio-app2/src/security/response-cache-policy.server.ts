const redirectStatuses = new Set([301, 302, 303, 307, 308]);

/** Authentication state and one-time authorization URLs must not be replayed. */
export function applyResponseCachePolicy(
  request: Request,
  response: Response,
): Response {
  const { pathname } = new URL(request.url);
  if (
    pathname !== "/" &&
    !pathname.startsWith("/api/logto/") &&
    !redirectStatuses.has(response.status)
  ) {
    return response;
  }

  // Response.redirect() has immutable headers. Copy without reading the body
  // so streamed responses and separate Set-Cookie headers remain intact.
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
