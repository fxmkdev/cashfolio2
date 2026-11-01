import { describe, expect, it, vi } from "vitest";
import { runSeedRelease } from "./release";

describe("nonproduction release orchestration", () => {
  it.each([undefined, "verify", "migrate", "grant", "replace"])(
    "stops immediately when %s fails",
    async (failure) => {
      const calls: string[] = [];
      const step = (name: string) =>
        vi.fn(async () => {
          calls.push(name);
          if (name === failure) throw new Error(name);
          return "complete";
        });
      const result = runSeedRelease({
        verify: step("verify"),
        migrate: step("migrate"),
        grant: step("grant"),
        replace: step("replace"),
      });
      if (failure) await expect(result).rejects.toThrow(failure);
      else await expect(result).resolves.toBe("complete");
      const sequence = ["verify", "migrate", "grant", "replace"];
      expect(calls).toEqual(
        sequence.slice(0, failure ? sequence.indexOf(failure) + 1 : 4),
      );
    },
  );
});
