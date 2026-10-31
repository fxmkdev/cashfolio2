import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

vi.mock("../auth/functions.server", () => ({
  ensureAuthenticated: vi.fn(),
}));

import { ensureUser, ensureUserHasRole } from "./functions.server";
import { getOrCreateUser } from "../e2e/user.server";
import { ensureAuthenticated } from "../auth/functions.server";
import { UserRole } from "../.prisma-client/enums";
import {
  bindResourceUser,
  createUserScopedSharedWork,
  withResourceRequest,
} from "../server/resource-context.server";
import { resourceStorage } from "../server/resource-scope.server";
import { deferred } from "../server/test-support/deferred";

const userContext = {
  isAuthenticated: true,
  claims: {
    iss: "https://example.test",
    sub: "user-external-id",
    aud: "cashfolio",
    exp: 1_767_225_600,
    iat: 1_767_139_200,
  },
};

const user = {
  id: "user-id",
  externalId: "user-external-id",
  roles: [],
  locale: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("getOrCreateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shares concurrent lookups for the same externalId", async () => {
    let resolveUpsert: (value: typeof user) => void = () => undefined;
    prisma.user.upsert.mockReturnValueOnce(
      new Promise<typeof user>((resolve) => {
        resolveUpsert = resolve;
      }),
    );

    const firstLookup = getOrCreateUser(userContext);
    const secondLookup = getOrCreateUser(userContext);

    expect(prisma.user.upsert).toHaveBeenCalledTimes(1);

    resolveUpsert(user);
    await expect(Promise.all([firstLookup, secondLookup])).resolves.toEqual([
      user,
      user,
    ]);
  });

  it("returns the concurrently-created user when upsert races on externalId", async () => {
    prisma.user.upsert.mockRejectedValueOnce({
      code: "P2002",
    });
    prisma.user.findUnique.mockResolvedValueOnce(user);

    await expect(getOrCreateUser(userContext)).resolves.toBe(user);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { externalId: "user-external-id" },
    });
  });

  it("rethrows non-unique upsert errors", async () => {
    const error = new Error("database unavailable");
    prisma.user.upsert.mockRejectedValueOnce(error);

    await expect(getOrCreateUser(userContext)).rejects.toBe(error);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("Admin authorization", () => {
  it.each([false, true])(
    "checks deletion pending state (%s)",
    async (deletionPending) => {
      vi.mocked(ensureAuthenticated).mockResolvedValue(userContext);
      prisma.user.findUnique.mockResolvedValue({
        ...user,
        roles: [UserRole.ADMIN],
        deletionPending,
      });
      if (deletionPending) {
        await expect(ensureUserHasRole(UserRole.ADMIN)).rejects.toMatchObject({
          status: 403,
        });
      } else {
        await expect(ensureUserHasRole(UserRole.ADMIN)).resolves.toMatchObject({
          deletionPending: false,
        });
      }
    },
  );
});

describe("ordinary user lookup", () => {
  it("binds the verified application user so independent requests can share work", async () => {
    vi.clearAllMocks();
    vi.mocked(ensureAuthenticated).mockResolvedValue(userContext);
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      deletionPending: false,
    });
    const shared = createUserScopedSharedWork<number>();
    const ready = deferred();
    const joined = deferred();
    const release = deferred<number>();
    const operation = vi.fn(() => {
      ready.resolve();
      return release.promise;
    });
    const request = (second = false) =>
      withResourceRequest(new AbortController().signal, async () => {
        await ensureUser();
        const work = shared("key", operation);
        if (second) joined.resolve();
        expect(await work).toBe(1);
        return new Response();
      });
    const first = request();
    await ready.promise;
    const second = request(true);
    await joined.promise;
    release.resolve(1);
    expect((await Promise.all([first, second])).map((r) => r.status)).toEqual([
      200, 200,
    ]);
    expect(operation).toHaveBeenCalledOnce();
  });

  it.each([null, { ...user, deletionPending: true }])(
    "does not bind an unavailable user (%s)",
    async (record) => {
      vi.mocked(ensureAuthenticated).mockResolvedValue(userContext);
      prisma.user.findUnique.mockResolvedValue(record);
      await withResourceRequest(new AbortController().signal, async () => {
        await expect(ensureUser()).rejects.toMatchObject({ status: 403 });
        expect(resourceStorage.getStore()?.userId).toBeUndefined();
        bindResourceUser("another-verified-user");
        return new Response();
      });
    },
  );

  it("does not recreate a deleted user from an existing authenticated context", async () => {
    vi.clearAllMocks();
    vi.mocked(ensureAuthenticated).mockResolvedValue(userContext);
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(ensureUser()).rejects.toMatchObject({ status: 403 });
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it("cannot enable test-user provisioning through the E2E environment in a normal build", async () => {
    vi.clearAllMocks();
    vi.stubEnv("APP_ENVIRONMENT", "e2e");
    vi.mocked(ensureAuthenticated).mockResolvedValue(userContext);
    prisma.user.findUnique.mockResolvedValue(null);
    try {
      await expect(ensureUser()).rejects.toMatchObject({ status: 403 });
      expect(prisma.user.upsert).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
