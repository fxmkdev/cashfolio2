import { isRedirect } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCookie: vi.fn(),
  getLogtoContext: vi.fn(),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getCookie: mocks.getCookie,
}));
vi.mock("./logto.server", () => ({
  getLogtoContext: mocks.getLogtoContext,
}));

import {
  ensureAuthenticated,
  getAuthenticationContext,
} from "./functions.server";
import { E2E_AUTH_EXTERNAL_ID_COOKIE } from "./e2e-auth";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("E2E_AUTH_BYPASS", "false");
  vi.stubEnv("E2E_TEST_MODE", "false");
  vi.stubEnv("E2E_AUTH_EXTERNAL_ID", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("getAuthenticationContext", () => {
  it.each([false, true])(
    "returns Logto's authenticated=%s context without redirecting",
    async (isAuthenticated) => {
      const context = { isAuthenticated };
      mocks.getLogtoContext.mockResolvedValue(context);

      await expect(getAuthenticationContext()).resolves.toBe(context);
      expect(mocks.getLogtoContext).toHaveBeenCalledExactlyOnceWith({
        getAccessToken: false,
      });
      expect(mocks.getCookie).not.toHaveBeenCalled();
    },
  );

  it("preserves session lookup failures", async () => {
    const error = new Error("Session lookup failed");
    mocks.getLogtoContext.mockRejectedValue(error);
    await expect(getAuthenticationContext()).rejects.toBe(error);
  });

  it.each([
    ["cookie-user", "configured-user", "cookie-user"],
    [undefined, "configured-user", "configured-user"],
    [undefined, undefined, "e2e-user"],
  ])(
    "uses the existing test identity fallback for cookie %s and configured ID %s",
    async (cookie, configuredId, expectedId) => {
      vi.stubEnv("E2E_AUTH_BYPASS", "true");
      vi.stubEnv("E2E_TEST_MODE", "true");
      vi.stubEnv("E2E_AUTH_EXTERNAL_ID", configuredId);
      mocks.getCookie.mockReturnValue(cookie);

      await expect(getAuthenticationContext()).resolves.toMatchObject({
        isAuthenticated: true,
        claims: { sub: expectedId },
      });
      expect(mocks.getCookie).toHaveBeenCalledWith(E2E_AUTH_EXTERNAL_ID_COOKIE);
      expect(mocks.getLogtoContext).not.toHaveBeenCalled();
    },
  );

  it("does not bypass Logto when test mode is disabled", async () => {
    vi.stubEnv("E2E_AUTH_BYPASS", "true");
    mocks.getLogtoContext.mockResolvedValue({ isAuthenticated: false });

    await expect(getAuthenticationContext()).resolves.toEqual({
      isAuthenticated: false,
    });
    expect(mocks.getCookie).not.toHaveBeenCalled();
  });
});

describe("ensureAuthenticated", () => {
  it("returns the signed-in context", async () => {
    const context = { isAuthenticated: true, claims: { sub: "user-1" } };
    mocks.getLogtoContext.mockResolvedValue(context);
    await expect(ensureAuthenticated()).resolves.toBe(context);
  });

  it("retains the sign-in redirect for an anonymous session", async () => {
    mocks.getLogtoContext.mockResolvedValue({ isAuthenticated: false });
    const error = await ensureAuthenticated().catch((error: unknown) => error);
    expect(isRedirect(error)).toBe(true);
    expect(error).toMatchObject({
      options: {
        href: "/api/logto/sign-in",
        reloadDocument: true,
      },
    });
  });

  it("preserves session lookup failures", async () => {
    const error = new Error("Session lookup failed");
    mocks.getLogtoContext.mockRejectedValue(error);
    await expect(ensureAuthenticated()).rejects.toBe(error);
  });
});
