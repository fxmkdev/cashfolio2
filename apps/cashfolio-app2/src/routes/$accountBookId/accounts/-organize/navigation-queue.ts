type WaitingNavigation = {
  originIndex: number;
  targetIndex?: number;
  restoringOrigin: boolean;
  resolve: (cancel: boolean) => void;
};

/** Preserve the first destination even when a rejected second pop restores it. */
export function createOrganizeNavigationQueue(port: {
  isPending: () => boolean;
  browserIndex: () => number | undefined;
  go: (delta: number) => void;
}) {
  let waiting: WaitingNavigation | undefined;
  return {
    wait(originIndex: number, traversal: boolean): boolean | Promise<boolean> {
      if (waiting) {
        if (traversal) waiting.restoringOrigin = true;
        return true;
      }
      return new Promise<boolean>((resolve) => {
        waiting = {
          originIndex,
          targetIndex: traversal ? port.browserIndex() : undefined,
          restoringOrigin: false,
          resolve,
        };
      });
    },
    flush() {
      if (!waiting || port.isPending()) return;
      const currentIndex = port.browserIndex();
      // TanStack reverses rejected native traversals asynchronously. Do not
      // replay the first request until that reversal has actually completed.
      if (waiting.restoringOrigin && currentIndex !== waiting.originIndex)
        return;
      const first = waiting;
      waiting = undefined;
      first.resolve(false);
      if (
        first.targetIndex !== undefined &&
        currentIndex !== undefined &&
        first.targetIndex !== currentIndex
      )
        port.go(first.targetIndex - currentIndex);
    },
    dispose() {
      waiting?.resolve(true);
      waiting = undefined;
    },
  };
}
