import { createHash, randomBytes } from "node:crypto";
import { addDays, addHours, addMinutes } from "date-fns";

export const SESSION_COOKIE = "__Host-cashfolio-session";
export const LEGACY_SESSION_COOKIE = "logtoCookies";

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string | undefined): string | null {
  return token && /^[A-Za-z0-9_-]{43}$/.test(token)
    ? createHash("sha256").update(token).digest("hex")
    : null;
}

export function sessionDeadlines(now: Date, authenticated: boolean) {
  const expiresAt = authenticated ? addDays(now, 14) : addMinutes(now, 10);
  return {
    expiresAt,
    idleExpiresAt: authenticated ? addHours(now, 24) : expiresAt,
  };
}

export function isSessionCurrent(
  session: { expiresAt: Date; idleExpiresAt: Date },
  now = new Date(),
) {
  return session.expiresAt > now && session.idleExpiresAt > now;
}

export function nextIdleDeadline(expiresAt: Date, now = new Date()) {
  return new Date(Math.min(expiresAt.getTime(), addHours(now, 24).getTime()));
}
