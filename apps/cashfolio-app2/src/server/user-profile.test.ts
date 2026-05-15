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
const ensureUser = vi.hoisted(() => vi.fn());
const fetchLogtoAccountApi = vi.hoisted(() => vi.fn());
const getLogtoAccountSecurityUrl = vi.hoisted(() => vi.fn());
const ensureSameOriginRequestFromServerContext = vi.hoisted(() => vi.fn());
const getRequest = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  user: {
    update: vi.fn(),
  },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest,
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

vi.mock("@/users/functions.server", () => ({
  ensureUser,
}));

vi.mock("@/prisma.server", () => ({
  prisma,
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
        locale: "en-CH",
      }),
    ).toEqual({
      name: null,
      avatarUrl: null,
      locale: "en-CH",
    });
  });

  it("trims text fields and accepts http avatar URLs", () => {
    expect(
      normalizeUserSettingsInput({
        name: "  Ada Lovelace  ",
        avatarUrl: "  http://example.test/ada.png  ",
        locale: "de-CH",
      }),
    ).toEqual({
      name: "Ada Lovelace",
      avatarUrl: "http://example.test/ada.png",
      locale: "de-CH",
    });

    expect(
      normalizeUserSettingsInput({
        name: "Ada",
        avatarUrl: "https://example.test/ada.png",
        locale: "fr-FR",
      }),
    ).toMatchObject({
      avatarUrl: "https://example.test/ada.png",
      locale: "fr-FR",
    });
  });

  it("rejects invalid avatar URLs", () => {
    expect(() =>
      normalizeUserSettingsInput({
        name: "Ada",
        avatarUrl: "example.test/ada.png",
        locale: "en-CH",
      }),
    ).toThrow("Avatar URL must be a valid absolute URL.");

    expect(() =>
      normalizeUserSettingsInput({
        name: "Ada",
        avatarUrl: "ftp://example.test/ada.png",
        locale: "en-CH",
      }),
    ).toThrow("Avatar URL must use HTTP or HTTPS.");
  });

  it("rejects unsupported locales", () => {
    expect(() =>
      normalizeUserSettingsInput({
        name: "Ada",
        avatarUrl: "",
        locale: "es-ES",
      }),
    ).toThrow("Locale must be a supported locale.");

    expect(() =>
      normalizeUserSettingsInput({
        name: "Ada",
        avatarUrl: "",
        locale: 123,
      }),
    ).toThrow("Locale must be a string.");
  });

  it("enforces Logto profile field length limits", () => {
    expect(() =>
      normalizeUserSettingsInput({
        name: "a".repeat(129),
        avatarUrl: "",
        locale: "en-CH",
      }),
    ).toThrow("Name cannot be longer than 128 characters.");

    expect(() =>
      normalizeUserSettingsInput({
        name: "Ada",
        avatarUrl: `https://example.test/${"a".repeat(2049)}`,
        locale: "en-CH",
      }),
    ).toThrow("Avatar URL cannot be longer than 2048 characters.");
  });

  it("uses human-readable labels for non-string text fields", () => {
    expect(() =>
      normalizeUserSettingsInput({
        name: 123,
        avatarUrl: "",
        locale: "en-CH",
      }),
    ).toThrow("Name must be a string.");

    expect(() =>
      normalizeUserSettingsInput({
        name: "Ada",
        avatarUrl: 123,
        locale: "en-CH",
      }),
    ).toThrow("Avatar URL must be a string.");
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
    ensureUser.mockResolvedValue({
      id: "user-1",
      locale: "de-CH",
    });
    getRequest.mockReturnValue(
      new Request("https://app.example.test/user-settings", {
        headers: {
          "accept-language": "fr-CA,fr;q=0.9,en;q=0.8",
        },
      }),
    );
    prisma.user.update.mockResolvedValue({
      id: "user-1",
      locale: "fr-FR",
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

    expect(ensureUser).toHaveBeenCalledTimes(1);
    expect(fetchLogtoAccountApi).toHaveBeenCalledWith("/api/my-account");
    expect(result).toEqual({
      name: "Ada Lovelace",
      avatarUrl: "https://example.test/ada.png",
      initials: "AL",
      locale: "de-CH",
    });
  });

  it("resolves the locale from Accept-Language when the user has no stored locale", async () => {
    ensureUser.mockResolvedValueOnce({
      id: "user-1",
      locale: null,
    });

    await expect(getAuthenticatedUserSettings()).resolves.toMatchObject({
      locale: "fr-CH",
    });
  });

  it("falls back to en-CH for unsupported or missing browser locales", async () => {
    ensureUser.mockResolvedValueOnce({
      id: "user-1",
      locale: null,
    });
    getRequest.mockReturnValueOnce(
      new Request("https://app.example.test/user-settings", {
        headers: {
          "accept-language": "es-ES,pt-BR;q=0.9",
        },
      }),
    );

    await expect(getAuthenticatedUserSettings()).resolves.toMatchObject({
      locale: "en-CH",
    });

    ensureUser.mockResolvedValueOnce({
      id: "user-1",
      locale: null,
    });
    getRequest.mockReturnValueOnce(
      new Request("https://app.example.test/user-settings"),
    );

    await expect(getAuthenticatedUserSettings()).resolves.toMatchObject({
      locale: "en-CH",
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
        locale: "fr-FR",
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
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { locale: "fr-FR" },
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
          locale: "en-CH",
        },
      }),
    ).rejects.toThrow("Avatar is not allowed.");
  });

  it("asks users to sign in again when Account API access cannot be minted", async () => {
    fetchLogtoAccountApi.mockRejectedValueOnce(
      Object.assign(new Error("Invalid scope."), { code: "invalid_scope" }),
    );

    await expect(getAuthenticatedUserSettings()).rejects.toThrow(
      "Account settings need a fresh sign-in. Please sign out and sign in again.",
    );
  });

  it("asks users to sign in again when Account API update access cannot be minted", async () => {
    fetchLogtoAccountApi.mockRejectedValueOnce(
      Object.assign(new Error("Not authenticated."), {
        code: "not_authenticated",
      }),
    );

    await expect(
      updateAuthenticatedUserSettings({
        data: {
          name: "Ada",
          avatarUrl: "https://example.test/ada.png",
          locale: "en-CH",
        },
      }),
    ).rejects.toThrow(
      "Account settings need a fresh sign-in. Please sign out and sign in again.",
    );
  });

  it("preserves non-auth Account API load errors", async () => {
    fetchLogtoAccountApi.mockRejectedValueOnce(
      new Error("LOGTO_ENDPOINT must be set"),
    );

    await expect(getAuthenticatedUserSettings()).rejects.toThrow(
      "LOGTO_ENDPOINT must be set",
    );
  });

  it("preserves non-auth Account API update errors", async () => {
    fetchLogtoAccountApi.mockRejectedValueOnce(new Error("fetch failed"));

    await expect(
      updateAuthenticatedUserSettings({
        data: {
          name: "Ada",
          avatarUrl: "https://example.test/ada.png",
          locale: "en-CH",
        },
      }),
    ).rejects.toThrow("fetch failed");
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
