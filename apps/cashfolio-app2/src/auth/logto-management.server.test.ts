import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLogtoManagementApiTokenCacheForTests,
  deleteLogtoUser,
  getLogtoManagementApiAccessToken,
  getLogtoUser,
} from "./logto-management.server";

const fetchMock = vi.fn();

function setLogtoManagementEnv() {
  process.env.LOGTO_MANAGEMENT_API_ENDPOINT = "https://tenant.logto.app";
  process.env.LOGTO_MANAGEMENT_API_RESOURCE = "https://tenant.logto.app/api";
  process.env.LOGTO_MANAGEMENT_API_APP_ID = "m2m-app";
  process.env.LOGTO_MANAGEMENT_API_APP_SECRET = "m2m-secret";
}

function createJsonResponse(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("Logto Management API helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLogtoManagementApiTokenCacheForTests();
    setLogtoManagementEnv();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LOGTO_MANAGEMENT_API_ENDPOINT;
    delete process.env.LOGTO_MANAGEMENT_API_RESOURCE;
    delete process.env.LOGTO_MANAGEMENT_API_APP_ID;
    delete process.env.LOGTO_MANAGEMENT_API_APP_SECRET;
  });

  it("fetches and caches a Management API token with client credentials", async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse({
        access_token: "management-token",
        expires_in: 3600,
      }),
    );

    const firstToken = await getLogtoManagementApiAccessToken();
    const secondToken = await getLogtoManagementApiAccessToken();

    expect(firstToken).toBe("management-token");
    expect(secondToken).toBe("management-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://tenant.logto.app/oidc/token"),
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from("m2m-app:m2m-secret").toString(
            "base64",
          )}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          resource: "https://tenant.logto.app/api",
          scope: "all",
        }).toString(),
      },
    );
  });

  it("deletes a Logto user with the Management API bearer token", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          access_token: "management-token",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await deleteLogtoUser("user 1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      new URL("https://tenant.logto.app/api/users/user%201"),
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer management-token",
        },
      },
    );
  });

  it("fetches a Logto user with profile fields", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          access_token: "management-token",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          id: "user-1",
          username: "ada",
          primaryEmail: "ada@example.test",
          name: "Ada Lovelace",
          avatar: "https://example.test/ada.png",
          lastSignInAt: 1_767_225_600_000,
        }),
      );

    await expect(getLogtoUser("user 1")).resolves.toEqual({
      id: "user-1",
      username: "ada",
      primaryEmail: "ada@example.test",
      name: "Ada Lovelace",
      avatar: "https://example.test/ada.png",
      lastSignInAt: 1_767_225_600_000,
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      new URL("https://tenant.logto.app/api/users/user%201"),
      {
        method: "GET",
        headers: {
          authorization: "Bearer management-token",
        },
      },
    );
  });

  it("returns null for a missing Logto user lookup", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          access_token: "management-token",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(getLogtoUser("user-1")).resolves.toBeNull();
  });

  it("treats a missing Logto user as already deleted", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          access_token: "management-token",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(deleteLogtoUser("user-1")).resolves.toBeUndefined();
  });

  it("surfaces Management API errors", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          access_token: "management-token",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({ message: "Forbidden" }, { status: 403 }),
      );

    await expect(deleteLogtoUser("user-1")).rejects.toThrow("Forbidden");
  });
});
