import { describe, expect, it } from "vitest";
import {
  hashSessionToken,
  isSessionCurrent,
  newSessionToken,
  nextIdleDeadline,
  sessionDeadlines,
} from "./session-policy";

describe("session deadlines and credentials", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  it("uses independent opaque credentials and hashes rather than storing bearers", () => {
    const first = newSessionToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSessionToken()).not.toBe(first);
    expect(hashSessionToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(first)).not.toBe(first);
    for (const value of [
      undefined,
      "",
      "old.encrypted-cookie",
      "a".repeat(44),
      "/".repeat(43),
    ]) {
      expect(hashSessionToken(value)).toBeNull();
    }
  });
  it("limits pending OIDC state to ten minutes", () => {
    const deadlines = sessionDeadlines(now, false);
    expect(deadlines).toEqual({
      expiresAt: new Date("2026-10-27T12:10:00Z"),
      idleExpiresAt: new Date("2026-10-27T12:10:00Z"),
    });
    expect(isSessionCurrent(deadlines, new Date("2026-10-27T12:10:00Z"))).toBe(
      false,
    );
  });
  it("enforces both authenticated expiry boundaries exactly", () => {
    const deadlines = sessionDeadlines(now, true);
    expect(deadlines.expiresAt).toEqual(new Date("2026-11-10T12:00:00Z"));
    expect(deadlines.idleExpiresAt).toEqual(new Date("2026-10-28T12:00:00Z"));
    expect(
      isSessionCurrent(deadlines, new Date("2026-10-28T11:59:59.999Z")),
    ).toBe(true);
    expect(isSessionCurrent(deadlines, deadlines.idleExpiresAt)).toBe(false);
    expect(
      isSessionCurrent(
        { ...deadlines, idleExpiresAt: new Date("2026-11-11") },
        deadlines.expiresAt,
      ),
    ).toBe(false);
  });
  it("never extends idle expiry beyond the original absolute deadline", () => {
    const expiresAt = new Date("2026-11-10T12:00:00Z");
    expect(nextIdleDeadline(expiresAt, now)).toEqual(
      new Date("2026-10-28T12:00:00Z"),
    );
    expect(nextIdleDeadline(expiresAt, new Date("2026-11-10"))).toEqual(
      expiresAt,
    );
  });
});

// Session lifetimes are elapsed durations, even when a local day is 23/25 hours.
it.each(["2026-03-29T00:30:00Z", "2026-10-25T00:30:00Z"])(
  "preserves elapsed session lifetimes across DST at %s",
  (value) => {
    const now = new Date(value);
    const deadlines = sessionDeadlines(now, true);
    expect(deadlines.expiresAt.getTime() - now.getTime()).toBe(
      14 * 24 * 60 * 60 * 1000,
    );
    expect(deadlines.idleExpiresAt.getTime() - now.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
    expect(
      sessionDeadlines(now, false).expiresAt.getTime() - now.getTime(),
    ).toBe(10 * 60 * 1000);
  },
);
