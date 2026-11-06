import { useCallback } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { DEFAULT_USER_LOCALE } from "@/user-locale";
import { useExplicitPeriodFilter } from "../../-use-explicit-period-filter";
import { parseLedgerExplicitPeriod } from "./page-types";

const maxDate = new Date("2026-03-28T00:00:00.000Z");
const minBookingDate = new Date("2021-03-01T00:00:00.000Z");
const keepSelectedPeriod = ({
  selectedPeriod,
}: {
  selectedPeriod: { value: string };
}) => selectedPeriod.value;

export function useLedgerStoryPeriod() {
  const navigate = useNavigate({ from: "/$accountBookId/$accountId" });
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const search = useRouterState({ select: (state) => state.location.search });
  const routeSearchPeriod =
    typeof search.period === "string" ? search.period : undefined;
  const onPeriodChange = useCallback(
    (period: string | undefined) => {
      void navigate({ search: (previous) => ({ ...previous, period }) });
    },
    [navigate],
  );
  const filter = useExplicitPeriodFilter({
    available: true,
    period: routeSearchPeriod,
    locale: DEFAULT_USER_LOCALE,
    parsePeriod: parseLedgerExplicitPeriod,
    clampPeriod: keepSelectedPeriod,
    clampMinDate: minBookingDate,
    navigationMinDate: minBookingDate,
    maxDate,
    allowClear: true,
    onPeriodChange,
  });
  return { ...filter, pathname, routeSearchPeriod };
}
