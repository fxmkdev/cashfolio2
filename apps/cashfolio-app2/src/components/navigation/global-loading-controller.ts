type ProgressActions = { start: () => void; complete: () => void };
type ScheduleFrame = (callback: () => void) => () => void;

const START_DELAY_MS = 120;

/** One progress lifecycle shared by router transitions and client-side tasks. */
export function createGlobalLoadingController(
  progress: ProgressActions,
  scheduleFrame: ScheduleFrame = (callback) => {
    const id = requestAnimationFrame(callback);
    return () => cancelAnimationFrame(id);
  },
) {
  const active = new Set<object>();
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelCompletion: (() => void) | undefined;
  let started = false;

  function cancelScheduledCompletion() {
    const cancel = cancelCompletion;
    cancelCompletion = undefined;
    cancel?.();
  }

  function cancelScheduledStart() {
    clearTimeout(startTimer);
    startTimer = undefined;
  }

  return {
    begin() {
      const token = {};
      active.add(token);
      cancelScheduledCompletion();
      if (!started && startTimer === undefined) {
        startTimer = setTimeout(() => {
          startTimer = undefined;
          started = true;
          progress.start();
        }, START_DELAY_MS);
      }
      return () => {
        if (!active.delete(token) || active.size) return;
        cancelScheduledStart();
        if (started) {
          // Let a destination's client task take over a settled router load
          // before completing the bar between the two effects.
          cancelCompletion = scheduleFrame(() => {
            cancelCompletion = undefined;
            if (active.size || !started) return;
            started = false;
            progress.complete();
          });
        }
      };
    },
    reset() {
      active.clear();
      cancelScheduledStart();
      cancelScheduledCompletion();
      if (started) {
        started = false;
        progress.complete();
      }
    },
  };
}
