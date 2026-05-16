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

import { getOrCreateUser } from "./functions.server";

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

  it("returns the concurrently-created user when upsert races on externalId", async () => {
    prisma.user.upsert.mockRejectedValueOnce({
      code: "P2002",
      meta: { target: ['"externalId"'] },
    });
    prisma.user.findUnique.mockResolvedValueOnce(user);

    await expect(getOrCreateUser(userContext)).resolves.toBe(user);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { externalId: "user-external-id" },
    });
  });
});
