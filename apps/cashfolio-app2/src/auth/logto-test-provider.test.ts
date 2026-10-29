import { once } from "node:events";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { closeTestProviders, createTestProvider } from "./logto-test-provider";

afterEach(() => {
  closeTestProviders();
  vi.restoreAllMocks();
});

it("blocks unmatched HTTP requests without contacting the destination", async () => {
  const onRequest = vi.fn();
  const server = createServer((request, response) => {
    onRequest(request.url);
    response.end("Unexpected network access");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    createTestProvider();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a local TCP address");
    }

    await expect(
      fetch(`http://127.0.0.1:${address.port}/unmatched`, {
        signal: AbortSignal.timeout(2000),
      }),
    ).rejects.toMatchObject({
      cause: {
        message: expect.stringContaining(
          'Cannot bypass a request when using the "error" strategy for the "onUnhandledFrame" option.',
        ),
      },
    });
    expect(onRequest).not.toHaveBeenCalled();
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  }
});
