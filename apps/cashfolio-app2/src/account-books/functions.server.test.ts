import { isNotFound, rootRouteId } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureUser: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("../prisma.server", () => ({
  prisma: { userAccountBookLink: { findUnique: mocks.findUnique } },
}));
vi.mock("../users/functions.server", () => ({
  ensureUser: mocks.ensureUser,
}));

import { ensureAuthorizedForAccountBookId } from "./functions.server";

describe("ensureAuthorizedForAccountBookId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.ensureUser.mockResolvedValue({ id: "user-1" });
  });

  it("returns the current user's access link", async () => {
    const link = { userId: "user-1", accountBookId: "book-1" };
    mocks.findUnique.mockResolvedValue(link);

    await expect(ensureAuthorizedForAccountBookId("book-1")).resolves.toBe(
      link,
    );
    expect(mocks.findUnique).toHaveBeenCalledExactlyOnceWith({
      where: {
        userId_accountBookId: {
          userId: "user-1",
          accountBookId: "book-1",
        },
      },
    });
  });

  it("throws a serializable root not-found signal when no access link exists", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const error = await ensureAuthorizedForAccountBookId("missing-book").catch(
      (error: unknown) => error,
    );

    expect(isNotFound(error)).toBe(true);
    expect(error).toMatchObject({ routeId: rootRouteId });
    expect(error).not.toBeInstanceOf(Response);
    expect(isNotFound(JSON.parse(JSON.stringify(error)))).toBe(true);
  });

  it("preserves authentication failures without querying access links", async () => {
    const error = new Error("Authentication failed");
    mocks.ensureUser.mockRejectedValue(error);

    await expect(ensureAuthorizedForAccountBookId("book-1")).rejects.toBe(
      error,
    );
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("preserves database failures", async () => {
    const error = new Error("Database unavailable");
    mocks.findUnique.mockRejectedValue(error);

    await expect(ensureAuthorizedForAccountBookId("book-1")).rejects.toBe(
      error,
    );
  });
});
