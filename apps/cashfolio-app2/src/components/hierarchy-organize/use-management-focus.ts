import { useEffect, useRef, type RefObject } from "react";

// Blocking a grid recreates its action renderers, so a dialog's original DOM
// trigger may be detached by the time Mantine tries to return focus.
export function useManagementFocus(
  region: RefObject<HTMLElement | null>,
  enabled: boolean,
  blocked: boolean,
) {
  const trigger = useRef<string | undefined>(undefined);
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const wasBlocked = useRef(blocked);
  useEffect(() => {
    if (!enabled) return;
    const remember = (event: FocusEvent) => {
      if (blockedRef.current) return;
      const target = event.target;
      trigger.current =
        target instanceof HTMLElement &&
        region.current?.contains(target) &&
        target.closest(".actions-cell")
          ? (target.getAttribute("aria-label") ?? undefined)
          : undefined;
    };
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, [enabled, region]);
  useEffect(() => {
    const returning = wasBlocked.current && !blocked;
    wasBlocked.current = blocked;
    if (!enabled || !returning || !trigger.current) return;
    const label = trigger.current;
    const frame = requestAnimationFrame(() => {
      region.current
        ?.querySelector<HTMLButtonElement>(
          `.actions-cell button[aria-label="${CSS.escape(label)}"]:not(:disabled)`,
        )
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [blocked, enabled, region]);
}
