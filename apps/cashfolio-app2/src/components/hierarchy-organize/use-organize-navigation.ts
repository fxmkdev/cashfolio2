import { useOrganizeNavigationGuard } from "./use-organize-navigation-guard";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import {
  organizeRoute,
  type OrganizePage,
  createOrganizeReturnTarget,
  getOrganizeReturnDelta,
  type OrganizeReturnTarget,
} from "./navigation";

declare module "@tanstack/react-router" {
  interface HistoryState {
    organizeReturnTarget?: OrganizeReturnTarget;
  }
}

export function useOrganizeNavigation(
  accountBookId: string,
  requested: boolean,
  available: boolean,
  pending: boolean,
  page: OrganizePage = "accounts",
) {
  const router = useRouter();
  const navigate = useNavigate();
  useOrganizeNavigationGuard(accountBookId, pending, page);

  const replaceNormal = useCallback(
    () =>
      navigate({
        to: organizeRoute(page),
        params: { accountBookId },
        search: (previous) => ({ ...previous, organize: undefined }),
        state: (previous) => ({ ...previous, organizeReturnTarget: undefined }),
        replace: true,
        resetScroll: false,
      }),
    [accountBookId, navigate, page],
  );
  useEffect(() => {
    if (requested && !available) void replaceNormal();
  }, [available, replaceNormal, requested]);

  const enter = () => {
    if (!available || requested) return;
    const { location } = router.state;
    void navigate({
      to: organizeRoute(page),
      params: { accountBookId },
      search: (previous) => ({ ...previous, organize: true }),
      state: {
        organizeReturnTarget: createOrganizeReturnTarget(
          accountBookId,
          location.href,
          location.state.__TSR_index,
          page,
        ),
      },
      resetScroll: false,
    });
  };
  const exit = () => {
    if (pending) return;
    const { location } = router.state;
    const delta = getOrganizeReturnDelta(
      location.state.organizeReturnTarget,
      accountBookId,
      location.href,
      location.state.__TSR_index,
      page,
    );
    if (delta) router.history.go(delta);
    else void replaceNormal();
  };
  return { enter, exit };
}
