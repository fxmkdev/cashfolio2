import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerFn: vi.fn(() => ({
    handler: (handler: () => unknown) => handler,
  })),
  getAuthenticationContext: vi.fn(),
  setResponseHeader: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: mocks.createServerFn,
}));
vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: mocks.setResponseHeader,
}));
vi.mock("@/auth/functions.server", () => ({
  getAuthenticationContext: mocks.getAuthenticationContext,
}));

import { getAuthenticationStatus } from "./authentication";

describe("getAuthenticationStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([false, true])(
    "returns only the authenticated=%s boolean and prevents caching",
    async (isAuthenticated) => {
      mocks.getAuthenticationContext.mockResolvedValue({
        isAuthenticated,
        claims: { sub: "private-user-id" },
      });

      await expect(getAuthenticationStatus()).resolves.toBe(isAuthenticated);
      expect(mocks.getAuthenticationContext).toHaveBeenCalledExactlyOnceWith();
      expect(mocks.setResponseHeader).toHaveBeenCalledExactlyOnceWith(
        "Cache-Control",
        "no-store",
      );
    },
  );

  it("preserves authentication lookup failures", async () => {
    const error = new Error("Session lookup failed");
    mocks.getAuthenticationContext.mockRejectedValue(error);
    await expect(getAuthenticationStatus()).rejects.toBe(error);
  });
});
