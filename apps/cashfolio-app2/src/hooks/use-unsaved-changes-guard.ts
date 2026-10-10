import { useBlocker, useMatch } from "@tanstack/react-router";
import { useCallback, useState } from "react";

export function useUnsavedChangesGuard(hasUnsavedChanges: boolean) {
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const { routeId, pathname } = useMatch({ strict: false });
  const blocker = useBlocker({
    // The departing view may still be mounted while a destination loader
    // redirects. Only block departures from the route that owns these edits.
    shouldBlockFn: useCallback(
      ({ current }) =>
        hasUnsavedChanges &&
        current.routeId === routeId &&
        current.pathname === pathname,
      [hasUnsavedChanges, routeId, pathname],
    ),
    enableBeforeUnload: hasUnsavedChanges,
    withResolver: true,
  });
  const isNavigationBlocked = blocker.status === "blocked";

  function requestConfirmation(action: () => void) {
    if (hasUnsavedChanges) {
      setPendingAction(() => action);
    } else {
      action();
    }
  }

  function cancel() {
    setPendingAction(null);
    blocker.reset?.();
  }

  function confirm() {
    setPendingAction(null);
    if (isNavigationBlocked) {
      blocker.proceed();
    } else {
      pendingAction?.();
    }
  }

  return {
    isConfirmationOpen: isNavigationBlocked || pendingAction !== null,
    isNavigationBlocked,
    requestConfirmation,
    cancel,
    confirm,
  };
}
