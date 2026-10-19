import {
  ActionIcon,
  Group,
  Popover,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import type { CustomInnerHeaderGroupProps } from "ag-grid-react";
import { formatUtcDateForLocale } from "@/shared/date";
import { useUserLocale } from "@/user-locale-context";
import type { AccountGainLossSummaries } from "@/shared/account-gain-loss";
import type { AccountsGridRow } from "./-page-types";

export type GainLossHeaderParams = {
  data?: Pick<AccountGainLossSummaries, "startDate" | "asOfDate">;
  loading: boolean;
  isArchivedMode: boolean;
};

export function AccountGainLossHeader({
  displayName,
  data,
  loading,
  isArchivedMode,
}: CustomInnerHeaderGroupProps<AccountsGridRow> & GainLossHeaderParams) {
  const locale = useUserLocale();
  const startDate = data
    ? formatUtcDateForLocale(new Date(data.startDate), locale)
    : undefined;
  const asOfDate = data
    ? formatUtcDateForLocale(new Date(data.asOfDate), locale)
    : undefined;

  return (
    <Group gap={4} wrap="nowrap" miw={0}>
      <Text size="sm" truncate>
        {displayName}
      </Text>
      <Popover
        width={340}
        position="bottom-end"
        withArrow
        shadow="md"
        withinPortal
        trapFocus
        returnFocus
        middlewares={{ flip: true, shift: { padding: 12 } }}
      >
        <Popover.Target>
          <Tooltip label="Show gain/loss details">
            <ActionIcon
              aria-label="Show gain/loss details"
              size="sm"
              variant="subtle"
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <IconInfoCircle size={16} />
            </ActionIcon>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown
          aria-label="Gain/loss details"
          aria-labelledby={undefined}
          maw="calc(100vw - 24px)"
        >
          <Stack gap="xs">
            <Text size="sm">
              {data ? (
                <>
                  Since {startDate} · As of {asOfDate}
                </>
              ) : loading ? (
                "Loading calculation dates…"
              ) : (
                "Dates unavailable"
              )}
            </Text>
            <Text size="sm">
              Calculated holding G/L since account-book start; excludes explicit
              G/L bookings.
            </Text>
            <Text size="sm">
              Totals include only {isArchivedMode ? "archived" : "active"}{" "}
              accounts in this tab. Incomplete columns show —; totals require
              complete data for every eligible account.
            </Text>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
}
