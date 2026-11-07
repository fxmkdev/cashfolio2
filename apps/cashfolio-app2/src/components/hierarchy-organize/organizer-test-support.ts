import { afterEach, beforeEach, vi } from "vitest";
import { useOrganizer, type OrganizerApi } from "./use-organizer";
import { organizeStoryNodes } from "./story-fixtures";
import { harness, renderHook } from "./organizer-test-hook-harness";

export function render(
  api: OrganizerApi,
  onSaved = saved,
  autoLoad = true,
  metadata?: () => Promise<void>,
) {
  const useController = () => useOrganizer(onSaved, api, autoLoad, metadata);
  return renderHook(useController);
}
export const saved = vi.fn();
export async function ready(api: OrganizerApi) {
  render(api);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  return render(api);
}
export const move = {
  items: [organizeStoryNodes.find((node) => node.id === "checking")!],
  parentId: "destination",
  placement: "last" as const,
};
export function setupOrganizerTests() {
  beforeEach(() => {
    harness.slots = [];
    harness.cursor = 0;
    harness.effects = [];
    harness.cleanups = [];
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    harness.cleanups.forEach((cleanup) => cleanup());
    vi.useRealTimers();
  });
}
