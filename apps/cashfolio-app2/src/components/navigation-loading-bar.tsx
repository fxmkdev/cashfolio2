import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { NavigationProgress, nprogress } from "@mantine/nprogress";

const START_DELAY_MS = 120;

export function NavigationLoadingBar() {
  const isRouteLoadPending = useRouterState({
    select: (state) => {
      const resolvedHref = state.resolvedLocation?.href;
      return (
        state.isLoading &&
        resolvedHref !== undefined &&
        state.location.href !== resolvedHref
      );
    },
  });

  const startTimeoutRef = useRef<number | undefined>(undefined);
  const progressStartedRef = useRef(false);

  useEffect(() => {
    if (isRouteLoadPending) {
      if (
        !progressStartedRef.current &&
        startTimeoutRef.current === undefined
      ) {
        startTimeoutRef.current = window.setTimeout(() => {
          progressStartedRef.current = true;
          startTimeoutRef.current = undefined;
          nprogress.start();
        }, START_DELAY_MS);
      }

      return;
    }

    if (startTimeoutRef.current !== undefined) {
      window.clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = undefined;
    }

    if (progressStartedRef.current) {
      nprogress.complete();
      progressStartedRef.current = false;
    }
  }, [isRouteLoadPending]);

  useEffect(() => {
    return () => {
      if (startTimeoutRef.current !== undefined) {
        window.clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = undefined;
      }

      if (progressStartedRef.current) {
        nprogress.complete();
        progressStartedRef.current = false;
      }
    };
  }, []);

  return <NavigationProgress />;
}
