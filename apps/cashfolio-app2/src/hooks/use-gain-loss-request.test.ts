import { beforeEach, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void)[],
  cleanups: [] as (() => void)[],
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = initial;
    return [
      harness.slots[index],
      (value: unknown) => {
        harness.slots[index] =
          typeof value === "function" ? value(harness.slots[index]) : value;
      },
    ];
  },
  useEffect: (effect: () => (() => void) | void, deps: unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.slots[index] as unknown[] | undefined;
    if (
      !previous ||
      deps.some((value, position) => value !== previous[position])
    ) {
      harness.slots[index] = deps;
      harness.effects.push(() => {
        harness.cleanups[index]?.();
        harness.cleanups[index] = effect() ?? (() => {});
      });
    }
  },
}));
import { useGainLossRequest } from "./use-gain-loss-request";
function Render<T>(args: Parameters<typeof useGainLossRequest<T>>[0]) {
  harness.cursor = 0;
  const value = useGainLossRequest(args);
  harness.effects.splice(0).forEach((effect) => effect());
  return value;
}
function deferred() {
  let resolve!: (value: string) => void, reject!: (error: Error) => void;
  const promise = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.effects = [];
  harness.cleanups = [];
});
it("hides previous data immediately and ignores superseded responses", async () => {
  const a = deferred(),
    b = deferred();
  const loadA = vi.fn(() => a.promise),
    loadB = vi.fn(() => b.promise);
  const first = {
    enabled: true,
    scopeKey: "book:a",
    refreshKey: 1,
    load: loadA,
  };
  Render(first);
  const second = { ...first, scopeKey: "book:b", load: loadB };
  expect(Render(second)).toMatchObject({ data: undefined, loading: true });
  b.resolve("new");
  await b.promise;
  expect(Render(second).data).toBe("new");
  a.resolve("stale");
  await a.promise;
  expect(Render(second).data).toBe("new");
});
it("refreshes after mutation even if balances and scope are unchanged", async () => {
  const load = vi.fn().mockResolvedValue("before");
  const args = { enabled: true, scopeKey: "book:a", refreshKey: 1, load };
  Render(args);
  await Promise.resolve();
  expect(Render(args).data).toBe("before");
  load.mockResolvedValue("after");
  const refreshed = { ...args, refreshKey: 2 };
  expect(Render(refreshed).data).toBeUndefined();
  await Promise.resolve();
  expect(Render(refreshed).data).toBe("after");
});
it("retries failed requests and makes disabled scopes unavailable", async () => {
  const first = deferred(),
    second = deferred();
  const load = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const args = { enabled: true, scopeKey: "book:a", refreshKey: 1, load };
  Render(args);
  first.reject(new Error("offline"));
  await first.promise.catch(() => {});
  await Promise.resolve();
  const failed = Render(args);
  expect(failed.error).toContain("could not be loaded");
  failed.retry();
  expect(Render(args).error).toBeUndefined();
  second.resolve("restored");
  await second.promise;
  expect(Render(args).data).toBe("restored");
  expect(Render({ ...args, enabled: false })).toMatchObject({
    data: undefined,
    loading: false,
  });
});
