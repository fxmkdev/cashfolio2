import { describe, expect, it } from "vitest";
import { resolveAuthenticatedUserProfile } from "./user-profile";

describe("resolveAuthenticatedUserProfile", () => {
  it("uses display-name claims before email", () => {
    expect(
      resolveAuthenticatedUserProfile({
        name: "Ada Lovelace",
        username: "ada",
        email: "ada@example.test",
        picture: "https://example.test/ada.png",
      }),
    ).toEqual({
      displayName: "Ada Lovelace",
      avatarUrl: "https://example.test/ada.png",
      initials: "AL",
    });
  });

  it("falls back through username, email, and User", () => {
    expect(resolveAuthenticatedUserProfile({ username: "ada" })).toMatchObject({
      displayName: "ada",
      initials: "A",
    });

    expect(
      resolveAuthenticatedUserProfile({ email: "ada@example.test" }),
    ).toMatchObject({
      displayName: "ada@example.test",
      initials: "A",
    });

    expect(resolveAuthenticatedUserProfile({})).toEqual({
      displayName: "User",
      avatarUrl: null,
      initials: "U",
    });
  });
});
