import { describe, expect, it } from "vitest";
import { mapWithConcurrencyLimit } from "./concurrency";

describe("mapWithConcurrencyLimit", () => {
  it("stops queued work after a failure and waits for already-started siblings", async () => {
    const original = new Error("first worker failed");
    let fail!: (error: Error) => void;
    const failed = new Promise<never>((_resolve, reject) => {
      fail = reject;
    });
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const started: number[] = [];
    let settled = false;
    const result = mapWithConcurrencyLimit([0, 1, 2, 3], 2, async (item) => {
      started.push(item);
      if (item === 0) await failed;
      else if (item === 1) await pending;
      return item;
    }).catch((error: unknown) => {
      settled = true;
      return error;
    });
    fail(original);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(started).toEqual([0, 1]);
    finish();
    expect(await result).toBe(original);
    expect(started).toEqual([0, 1]);
  });

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
