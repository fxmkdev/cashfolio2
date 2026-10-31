import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGlobalLoadingController } from "./global-loading-controller";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function fixture() {
  const progress = { start: vi.fn(), complete: vi.fn() };
  const controller = createGlobalLoadingController(progress, (callback) => {
    const timer = setTimeout(callback, 16);
    return () => clearTimeout(timer);
  });
  return { controller, progress };
}

describe("shared global loading", () => {
  it("keeps the 120 ms delay and never flashes for fast tasks", () => {
    const { controller, progress } = fixture();
    const finish = controller.begin();
    vi.advanceTimersByTime(119);
    expect(progress.start).not.toHaveBeenCalled();
    finish();
    vi.runAllTimers();
    expect(progress.start).not.toHaveBeenCalled();
    expect(progress.complete).not.toHaveBeenCalled();

    const finishSlow = controller.begin();
    vi.advanceTimersByTime(120);
    expect(progress.start).toHaveBeenCalledOnce();
    finishSlow();
    vi.advanceTimersByTime(16);
    expect(progress.complete).toHaveBeenCalledOnce();
  });

  it("holds progress until every overlapping task settles", () => {
    const { controller, progress } = fixture();
    const first = controller.begin();
    const second = controller.begin();
    vi.advanceTimersByTime(120);
    first();
    first();
    vi.advanceTimersByTime(120);
    expect(progress.start).toHaveBeenCalledOnce();
    expect(progress.complete).not.toHaveBeenCalled();
    second();
    vi.advanceTimersByTime(16);
    expect(progress.complete).toHaveBeenCalledOnce();
  });

  it("hands router loading to client work without completing or restarting", () => {
    const { controller, progress } = fixture();
    const finishNavigation = controller.begin();
    vi.advanceTimersByTime(120);
    finishNavigation();
    const finishHistory = controller.begin();
    vi.advanceTimersByTime(120);
    expect(progress.start).toHaveBeenCalledOnce();
    expect(progress.complete).not.toHaveBeenCalled();
    finishHistory();
    vi.advanceTimersByTime(16);
    expect(progress.complete).toHaveBeenCalledOnce();
  });

  it("cleans up pending timers on provider teardown and supports effect reentry", () => {
    const { controller, progress } = fixture();
    const oldRelease = controller.begin();
    controller.reset();
    vi.runAllTimers();
    expect(progress.start).not.toHaveBeenCalled();
    const release = controller.begin();
    oldRelease();
    vi.advanceTimersByTime(120);
    expect(progress.start).toHaveBeenCalledOnce();
    release();
    controller.reset();
    controller.reset();
    vi.runAllTimers();
    expect(progress.complete).toHaveBeenCalledOnce();
  });
});
