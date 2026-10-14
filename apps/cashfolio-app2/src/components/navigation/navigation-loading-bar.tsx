import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { NavigationProgress, nprogress } from "@mantine/nprogress";

const START_DELAY_MS = 120;

export function NavigationLoadingBar() {
  const { href, isLoading } = useRouterState({
    select: (state) => ({
      href: state.location.href,
      isLoading: state.isLoading,
    }),
  });
  const lastSettledHrefRef = useRef<string | undefined>(undefined);
  const isRouteLoadPending =
    isLoading &&
    lastSettledHrefRef.current !== undefined &&
    href !== lastSettledHrefRef.current;

  const startTimeoutRef = useRef<number | undefined>(undefined);
  const progressStartedRef = useRef(false);

  useEffect(() => {
    if (lastSettledHrefRef.current === undefined) {
      lastSettledHrefRef.current = href;
    }

    if (!isLoading) {
      lastSettledHrefRef.current = href;
    }
  }, [href, isLoading]);

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
