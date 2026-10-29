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
  it("does not recreate a deleted user from an existing authenticated context", async () => {
    vi.clearAllMocks();
    vi.mocked(ensureAuthenticated).mockResolvedValue(userContext);
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(ensureUser()).rejects.toMatchObject({ status: 403 });
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it("cannot enable test-user provisioning through runtime flags in a normal build", async () => {
    vi.clearAllMocks();
    vi.stubEnv("E2E_TEST_MODE", "true");
    vi.stubEnv("E2E_AUTH_BYPASS", "true");
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
