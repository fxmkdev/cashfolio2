import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedUserSettings = vi.hoisted(() => vi.fn());

vi.mock("@/server/user-profile", () => ({
  getAuthenticatedUserSettings,
}));

import { loadUserSettingsPageData } from "./-page-loader";

describe("loadUserSettingsPageData", () => {
  beforeEach(() => {
    getAuthenticatedUserSettings.mockReset();
    getAuthenticatedUserSettings.mockResolvedValue({
      name: "Ada Lovelace",
      avatarUrl: "https://example.test/ada.png",
      initials: "AL",
      accountSecurityUrl: "https://tenant.logto.app/account/security",
    });
  });

  it("loads authenticated user settings", async () => {
    await expect(loadUserSettingsPageData()).resolves.toEqual({
      name: "Ada Lovelace",
      avatarUrl: "https://example.test/ada.png",
      initials: "AL",
      accountSecurityUrl: "https://tenant.logto.app/account/security",
    });
    expect(getAuthenticatedUserSettings).toHaveBeenCalledTimes(1);
  });
});
