import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { GridApi, GridState } from "ag-grid-enterprise";
import { useGlobalLoading } from "@/components/navigation/global-loading";
import { useOrganizer, type OrganizerApi } from "./use-organizer";
import { useOrganizeNavigation } from "./use-organize-navigation";
import type { OrganizePage } from "./navigation";

/** Entry/exit owns one fresh snapshot and preserves the mounted normal grid. */
export function useOrganizeSession<Row>({
  accountBookId,
  requested,
  available,
  page,
  api,
  onSaved,
  onActivate,
}: {
  accountBookId: string;
  requested: boolean;
  available: boolean;
  page: OrganizePage;
  api?: OrganizerApi;
  onSaved: () => void;
  onActivate?: () => void;
}) {
  const [active, setActive] = useState(false);
  const organizer = useOrganizer(onSaved, api, false);
  useGlobalLoading(organizer.loading || organizer.submitState.isRefreshing);
  const navigation = useOrganizeNavigation(
    accountBookId,
    requested,
    available,
    organizer.pending,
    page,
  );
  const normalGrid = useRef<GridApi<Row> | null>(null);
  const normalGridState = useRef<GridState | undefined>(undefined);
  const activate = useEffectEvent(() => {
    normalGridState.current = normalGrid.current?.getState();
    onActivate?.();
    setActive(true);
  });
  const { reset, load, snapshot } = organizer;
  const shouldLoad = requested && available;
  useEffect(() => {
    if (shouldLoad && snapshot && !active) activate();
  }, [active, shouldLoad, snapshot]);
  useEffect(() => {
    if (shouldLoad) {
      void load();
      return reset;
    }
    setActive(false);
    reset();
    const previous = normalGridState.current;
    normalGridState.current = undefined;
    const frame = requestAnimationFrame(() => {
      if (previous && !normalGrid.current?.isDestroyed())
        normalGrid.current?.setState(previous, ["rowSelection"]);
    });
    return () => cancelAnimationFrame(frame);
  }, [load, shouldLoad, reset]);
  return {
    organizer,
    navigation,
    normalGrid,
    isOrganizing: active && shouldLoad,
  };
}
