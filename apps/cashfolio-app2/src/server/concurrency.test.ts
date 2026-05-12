import { describe, expect, it } from "vitest";
import { mapWithConcurrencyLimit } from "./concurrency";

describe("mapWithConcurrencyLimit", () => {
  it("preserves result order while bounding active work", async () => {
    let activeCount = 0;
    let maxActiveCount = 0;

    const result = await mapWithConcurrencyLimit(
      [3, 1, 2],
      2,
      async (value) => {
        activeCount += 1;
        maxActiveCount = Math.max(maxActiveCount, activeCount);
        await Promise.resolve();
        activeCount -= 1;
        return value * 10;
      },
    );

    expect(result).toEqual([30, 10, 20]);
    expect(maxActiveCount).toBe(2);
  });

  it("clamps invalid concurrency limits to one worker", async () => {
    let activeCount = 0;
    let maxActiveCount = 0;

    const result = await mapWithConcurrencyLimit(
      [1, 2],
      Number.NaN,
      async (value) => {
        activeCount += 1;
        maxActiveCount = Math.max(maxActiveCount, activeCount);
        await Promise.resolve();
        activeCount -= 1;
        return value;
      },
    );

    expect(result).toEqual([1, 2]);
    expect(maxActiveCount).toBe(1);
  });
});
