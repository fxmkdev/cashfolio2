import { describe, expect, it, vi } from "vitest";
import { createOrganizeNavigationQueue } from "./navigation-queue";

function setup() {
  const state = { pending: true, index: 3 };
  const go = vi.fn();
  const queue = createOrganizeNavigationQueue({
    isPending: () => state.pending,
    browserIndex: () => state.index,
    go,
  });
  return { state, go, queue };
}

describe("pending organizer navigation", () => {
  it("continues a single Back after saving without adding another traversal", async () => {
    const { state, go, queue } = setup();
    state.index = 2;
    const first = queue.wait(3, true);
    queue.flush();
    state.pending = false;
    queue.flush();
    expect(await first).toBe(false);
    expect(go).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    "preserves the first Back when a rejected second Back restores the origin before settlement=%s",
    async (restoredFirst) => {
      const { state, go, queue } = setup();
      state.index = 2;
      const first = queue.wait(3, true);
      state.index = 1;
      expect(queue.wait(3, true)).toBe(true);
      if (restoredFirst) state.index = 3;
      state.pending = false;
      queue.flush();
      if (!restoredFirst) {
        expect(go).not.toHaveBeenCalled();
        state.index = 3;
        queue.flush();
      }
      expect(await first).toBe(false);
      expect(go).toHaveBeenCalledExactlyOnceWith(-1);
      queue.flush();
      expect(go).toHaveBeenCalledTimes(1);
    },
  );
  it("keeps a queued link navigation while rejecting subsequent attempts", async () => {
    const { state, go, queue } = setup();
    const first = queue.wait(3, false);
    expect(queue.wait(3, false)).toBe(true);
    state.pending = false;
    queue.flush();
    expect(await first).toBe(false);
    expect(go).not.toHaveBeenCalled();
  });
  it("replays a queued Forward in the original direction after a rejected Back", async () => {
    const { state, go, queue } = setup();
    state.index = 4;
    const first = queue.wait(3, true);
    state.index = 3;
    expect(queue.wait(3, true)).toBe(true);
    state.pending = false;
    queue.flush();
    expect(await first).toBe(false);
    expect(go).toHaveBeenCalledExactlyOnceWith(1);
  });
  it("waits for rejected native Back restoration before continuing a queued link", async () => {
    const { state, go, queue } = setup();
    const first = queue.wait(3, false);
    state.index = 2;
    expect(queue.wait(3, true)).toBe(true);
    state.pending = false;
    queue.flush();
    state.index = 3;
    queue.flush();
    expect(await first).toBe(false);
    expect(go).not.toHaveBeenCalled();
  });
  it("cancels the queued navigation when its route unmounts", async () => {
    const { queue, go } = setup();
    const first = queue.wait(3, false);
    queue.dispose();
    expect(await first).toBe(true);
    expect(go).not.toHaveBeenCalled();
  });
});
