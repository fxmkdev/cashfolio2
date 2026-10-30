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

beforeEach(() => {
  vi.resetAllMocks();
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

  it("preserves deletion-retry access options", async () => {
    const options = { allowDeletionPending: true };
    mocks.getLogtoContext.mockResolvedValue({ isAuthenticated: false });
    await getAuthenticationContext(options);
    expect(mocks.getLogtoContext).toHaveBeenCalledExactlyOnceWith(
      { getAccessToken: false },
      options,
    );
  });

  it("ignores a synthetic identity cookie and the E2E environment in a normal build", async () => {
    vi.stubEnv("APP_ENVIRONMENT", "e2e");
    mocks.getCookie.mockReturnValue("admin-external-id");
    mocks.getLogtoContext.mockResolvedValue({ isAuthenticated: false });
    await expect(getAuthenticationContext()).resolves.toEqual({
      isAuthenticated: false,
    });
    expect(mocks.getCookie).not.toHaveBeenCalled();
    expect(mocks.getLogtoContext).toHaveBeenCalledExactlyOnceWith({
      getAccessToken: false,
    });
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
