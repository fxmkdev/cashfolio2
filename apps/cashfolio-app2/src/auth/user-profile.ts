export type AuthenticatedUserProfile = {
  displayName: string;
  avatarUrl: string | null;
  initials: string;
};

function getStringClaim(claims: Record<string, unknown>, key: string) {
  const value = claims[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getInitials(displayName: string) {
  const words = displayName
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean);

  const initials =
    words.length > 1 ? `${words[0]}${words[1]}` : (words[0] ?? "U");

  return initials.toUpperCase();
}

export function resolveAuthenticatedUserProfile(
  claims: unknown,
): AuthenticatedUserProfile {
  const claimMap =
    typeof claims === "object" && claims !== null
      ? (claims as Record<string, unknown>)
      : {};

  const displayName =
    getStringClaim(claimMap, "name") ??
    getStringClaim(claimMap, "username") ??
    getStringClaim(claimMap, "email") ??
    "User";

  return {
    displayName,
    avatarUrl: getStringClaim(claimMap, "picture"),
    initials: getInitials(displayName),
  };
}
