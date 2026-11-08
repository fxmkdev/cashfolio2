export const harness = {
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void)[],
  cleanups: [] as (() => void)[],
};
export const reactHooksMock = {
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots))
      harness.slots[index] =
        typeof initial === "function" ? initial() : initial;
    return [
      harness.slots[index],
      (value: unknown) => {
        harness.slots[index] =
          typeof value === "function" ? value(harness.slots[index]) : value;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: initial };
    return harness.slots[index];
  },
  useCallback: (callback: unknown, deps: unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.slots[index] as
      { callback: unknown; deps: unknown[] } | undefined;
    if (!previous || deps.some((dep, i) => dep !== previous.deps[i]))
      harness.slots[index] = { callback, deps };
    return (harness.slots[index] as { callback: unknown }).callback;
  },
  useEffect: (effect: () => (() => void) | void, deps: unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.slots[index] as unknown[] | undefined;
    if (!previous || deps.some((dep, i) => dep !== previous[i])) {
      harness.slots[index] = deps;
      harness.effects.push(() => {
        harness.cleanups[index]?.();
        harness.cleanups[index] = effect() ?? (() => {});
      });
    }
  },
};

export function renderHook<T>(hook: () => T) {
  harness.cursor = 0;
  const result = hook();
  harness.effects.splice(0).forEach((effect) => effect());
  return result;
}
