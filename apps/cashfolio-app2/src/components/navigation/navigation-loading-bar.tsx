import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { NavigationProgress } from "@mantine/nprogress";
import { useGlobalLoading } from "./global-loading";

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

  useGlobalLoading(isRouteLoadPending);

  useEffect(() => {
    if (lastSettledHrefRef.current === undefined) {
      lastSettledHrefRef.current = href;
    }

    if (!isLoading) {
      lastSettledHrefRef.current = href;
    }
  }, [href, isLoading]);

  return <NavigationProgress data-testid="global-loading-indicator" />;
}
