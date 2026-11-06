import { organizeRoute, type OrganizePage } from "./navigation";
import { useBlocker, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { createOrganizeNavigationQueue } from "./navigation-queue";

function browserIndex() {
  const index: unknown = window.history.state?.__TSR_index;
  return typeof index === "number" && Number.isSafeInteger(index)
    ? index
    : undefined;
}

export function useOrganizeNavigationGuard(
  accountBookId: string,
  pending: boolean,
  page: OrganizePage = "accounts",
) {
  const router = useRouter();
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const [queue] = useState(() =>
    createOrganizeNavigationQueue({
      isPending: () => pendingRef.current,
      browserIndex,
      go: (delta) => router.history.go(delta),
    }),
  );
  useBlocker({
    shouldBlockFn: useCallback(
      ({ current, action }) => {
        if (
          !pendingRef.current ||
          current.routeId !== organizeRoute(page) ||
          current.params.accountBookId !== accountBookId
        )
          return false;
        return queue.wait(
          router.state.location.state.__TSR_index,
          action === "BACK" || action === "FORWARD" || action === "GO",
        );
      },
      [accountBookId, queue, router, page],
    ),
    enableBeforeUnload: pending,
  });
  useEffect(() => {
    queue.flush();
  }, [pending, queue]);
  useEffect(() => {
    const restored = () => queue.flush();
    window.addEventListener("popstate", restored);
    return () => {
      window.removeEventListener("popstate", restored);
      queue.dispose();
    };
  }, [queue]);
}
