import { getAuthenticatedUserSettings } from "@/server/user-profile";

export async function loadUserSettingsPageData() {
  return getAuthenticatedUserSettings();
}
