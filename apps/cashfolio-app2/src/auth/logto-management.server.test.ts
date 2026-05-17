import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLogtoManagementApiTokenCacheForTests,
  deleteLogtoUser,
  getLogtoManagementApiAccessToken,
  getLogtoUser,
  getLogtoUsers,
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

  it("fetches multiple Logto users with an exact id search", async () => {
    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          access_token: "management-token",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse([
          {
            id: "user-1",
            username: "ada",
            primaryEmail: "ada@example.test",
            name: "Ada Lovelace",
            avatar: null,
            lastSignInAt: null,
          },
          {
            id: "user-2",
            username: null,
            primaryEmail: "grace@example.test",
            name: "Grace Hopper",
            avatar: "https://example.test/grace.png",
            lastSignInAt: 1_767_225_600_000,
          },
        ]),
      );

    const users = await getLogtoUsers(["user 1", "user-2", "user-2"]);

    expect(Array.from(users.entries())).toEqual([
      [
        "user-1",
        {
          id: "user-1",
          username: "ada",
          primaryEmail: "ada@example.test",
          name: "Ada Lovelace",
          avatar: null,
          lastSignInAt: null,
        },
      ],
      [
        "user-2",
        {
          id: "user-2",
          username: null,
          primaryEmail: "grace@example.test",
          name: "Grace Hopper",
          avatar: "https://example.test/grace.png",
          lastSignInAt: 1_767_225_600_000,
        },
      ],
    ]);

    const expectedUrl = new URL("https://tenant.logto.app/api/users");
    expectedUrl.searchParams.append("search.id", "user 1");
    expectedUrl.searchParams.append("search.id", "user-2");
    expectedUrl.searchParams.set("mode.id", "exact");
    expectedUrl.searchParams.set("page_size", "2");
    expect(fetchMock).toHaveBeenLastCalledWith(expectedUrl, {
      method: "GET",
      headers: {
        authorization: "Bearer management-token",
      },
    });
  });

  it("chunks Logto user exact-id searches at the Management API page-size cap", async () => {
    const userIds = Array.from(
      { length: 101 },
      (_, index) => `user-${index + 1}`,
    );
    const createLogtoUser = (id: string) => ({
      id,
      username: null,
      primaryEmail: `${id}@example.test`,
      name: `Name ${id}`,
      avatar: null,
      lastSignInAt: null,
    });

    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse({
          access_token: "management-token",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(userIds.slice(0, 100).map(createLogtoUser)),
      )
      .mockResolvedValueOnce(
        createJsonResponse(userIds.slice(100).map(createLogtoUser)),
      );

    const users = await getLogtoUsers(userIds);

    expect(users.size).toBe(101);
    expect(users.get("user-1")).toMatchObject({
      id: "user-1",
      primaryEmail: "user-1@example.test",
    });
    expect(users.get("user-101")).toMatchObject({
      id: "user-101",
      primaryEmail: "user-101@example.test",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const firstBatchUrl = fetchMock.mock.calls[1]?.[0] as URL;
    const secondBatchUrl = fetchMock.mock.calls[2]?.[0] as URL;
    expect(firstBatchUrl.searchParams.getAll("search.id")).toEqual(
      userIds.slice(0, 100),
    );
    expect(firstBatchUrl.searchParams.get("page_size")).toBe("100");
    expect(secondBatchUrl.searchParams.getAll("search.id")).toEqual([
      "user-101",
    ]);
    expect(secondBatchUrl.searchParams.get("page_size")).toBe("1");
  });

  it("does not request Logto users when the requested id list is empty", async () => {
    await expect(getLogtoUsers([])).resolves.toEqual(new Map());

    expect(fetchMock).not.toHaveBeenCalled();
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
