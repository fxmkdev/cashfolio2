import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerFn = vi.hoisted(() =>
  vi.fn(() => {
    let validate: ((data: unknown) => unknown) | undefined;
    const chain = {
      inputValidator: vi.fn((validator: (data: unknown) => unknown) => {
        validate = validator;
        return chain;
      }),
      handler: vi.fn((handler: ({ data }: { data: unknown }) => unknown) => {
        return async (args?: { data: unknown }) => {
          const inputData = args && "data" in args ? args.data : undefined;
          const validatedData = validate ? validate(inputData) : inputData;
          return handler({ data: validatedData });
        };
      }),
    };
    return chain;
  }),
);

const ensureAuthenticated = vi.hoisted(() => vi.fn());
const fetchLogtoAccountApi = vi.hoisted(() => vi.fn());
const getLogtoAccountSecurityUrl = vi.hoisted(() => vi.fn());
const ensureSameOriginRequestFromServerContext = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("@/auth/functions.server", () => ({
  ensureAuthenticated,
}));

vi.mock("@/auth/logto.server", () => ({
  fetchLogtoAccountApi,
  getLogtoAccountSecurityUrl,
}));

vi.mock("@/security/same-origin.server", () => ({
  ensureSameOriginRequestFromServerContext,
}));

import {
  getAuthenticatedUserProfile,
  getAuthenticatedUserSettings,
  getUserAccountSecurityUrl,
  normalizeUserSettingsInput,
  updateAuthenticatedUserSettings,
} from "./user-profile";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
}

describe("normalizeUserSettingsInput", () => {
  it("normalizes empty fields to null", () => {
    expect(
      normalizeUserSettingsInput({
        name: "  ",
        avatarUrl: "",
      }),
    ).toEqual({
      name: null,
      avatarUrl: null,
    });
  });

  it("trims text fields and accepts http avatar URLs", () => {
    expect(
      normalizeUserSettingsInput({
        name: "  Ada Lovelace  ",
        avatarUrl: "  http://example.test/ada.png  ",
      }),
    ).toEqual({
      name: "Ada Lovelace",
      avatarUrl: "http://example.test/ada.png",
    });

    expect(
      normalizeUserSettingsInput({
        name: "Ada",
        avatarUrl: "https://example.test/ada.png",
      }),
    ).toMatchObject({
      avatarUrl: "https://example.test/ada.png",
    });
  });

  it("rejects invalid avatar URLs", () => {
    expect(() =>
      normalizeUserSettingsInput({
        name: "Ada",
        avatarUrl: "example.test/ada.png",
      }),
    ).toThrow("Avatar URL must be a valid absolute URL.");

    expect(() =>
      normalizeUserSettingsInput({
        name: "Ada",
        avatarUrl: "ftp://example.test/ada.png",
      }),
    ).toThrow("Avatar URL must use HTTP or HTTPS.");
  });

  it("enforces Logto profile field length limits", () => {
    expect(() =>
      normalizeUserSettingsInput({
        name: "a".repeat(129),
        avatarUrl: "",
      }),
    ).toThrow("Name cannot be longer than 128 characters.");

    expect(() =>
      normalizeUserSettingsInput({
        name: "Ada",
        avatarUrl: `https://example.test/${"a".repeat(2049)}`,
      }),
    ).toThrow("Avatar URL cannot be longer than 2048 characters.");
  });
});

describe("user profile server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAuthenticated.mockResolvedValue({
      claims: {
        name: "Claims User",
        email: "claims@example.test",
        picture: "https://example.test/claims.png",
      },
      isAuthenticated: true,
    });
    getLogtoAccountSecurityUrl.mockReturnValue(
      "https://tenant.logto.app/account/security",
    );
    fetchLogtoAccountApi.mockResolvedValue(
      jsonResponse({
        name: "Ada Lovelace",
        avatar: "https://example.test/ada.png",
        primaryEmail: "ada@example.test",
      }),
    );
  });

  it("loads user settings from Logto Account API", async () => {
    const result = await getAuthenticatedUserSettings();

    expect(ensureAuthenticated).toHaveBeenCalledTimes(1);
    expect(fetchLogtoAccountApi).toHaveBeenCalledWith("/api/my-account");
    expect(result).toEqual({
      name: "Ada Lovelace",
      avatarUrl: "https://example.test/ada.png",
      initials: "AL",
    });
  });

  it("returns the Logto account security URL", async () => {
    await expect(getUserAccountSecurityUrl()).resolves.toBe(
      "https://tenant.logto.app/account/security",
    );
  });

  it("omits the account security URL when Logto configuration is unavailable", async () => {
    getLogtoAccountSecurityUrl.mockImplementationOnce(() => {
      throw new Error("LOGTO_ENDPOINT must be set");
    });

    await expect(getUserAccountSecurityUrl()).resolves.toBeNull();
  });

  it("updates user settings through Logto Account API", async () => {
    await updateAuthenticatedUserSettings({
      data: {
        name: "  Ada Lovelace  ",
        avatarUrl: "  https://example.test/ada.png  ",
      },
    });

    expect(ensureSameOriginRequestFromServerContext).toHaveBeenCalledTimes(1);
    expect(fetchLogtoAccountApi).toHaveBeenCalledWith("/api/my-account", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Ada Lovelace",
        avatar: "https://example.test/ada.png",
      }),
    });
  });

  it("uses Logto error messages for failed updates", async () => {
    fetchLogtoAccountApi.mockResolvedValueOnce(
      jsonResponse({ message: "Avatar is not allowed." }, { status: 400 }),
    );

    await expect(
      updateAuthenticatedUserSettings({
        data: {
          name: "Ada",
          avatarUrl: "https://example.test/ada.png",
        },
      }),
    ).rejects.toThrow("Avatar is not allowed.");
  });

  it("loads shell profile from Logto Account API", async () => {
    await expect(getAuthenticatedUserProfile()).resolves.toEqual({
      displayName: "Ada Lovelace",
      avatarUrl: "https://example.test/ada.png",
      initials: "AL",
    });
    expect(fetchLogtoAccountApi).toHaveBeenCalledWith("/api/my-account");
  });

  it("falls back to claims when Logto Account API rejects shell profile loading", async () => {
    fetchLogtoAccountApi.mockResolvedValueOnce(
      jsonResponse({ message: "Account API is disabled." }, { status: 403 }),
    );

    await expect(getAuthenticatedUserProfile()).resolves.toEqual({
      displayName: "Claims User",
      avatarUrl: "https://example.test/claims.png",
      initials: "CU",
    });
    expect(fetchLogtoAccountApi).toHaveBeenCalledWith("/api/my-account");
  });

  it("falls back to claims when Logto Account API throws during shell profile loading", async () => {
    fetchLogtoAccountApi.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );

    await expect(getAuthenticatedUserProfile()).resolves.toEqual({
      displayName: "Claims User",
      avatarUrl: "https://example.test/claims.png",
      initials: "CU",
    });
    expect(fetchLogtoAccountApi).toHaveBeenCalledWith("/api/my-account");
  });
});
