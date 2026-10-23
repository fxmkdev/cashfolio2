import {
  ActionIcon,
  Group,
  Popover,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import type { CustomInnerHeaderGroupProps } from "ag-grid-react";
import { formatUtcDateForLocale } from "@/shared/date";
import { useUserLocale } from "@/user-locale-context";
import type { AccountGainLossSummaries } from "@/shared/account-gain-loss";
import type { AccountsGridRow } from "./-page-types";

const GainLossDetailsTargetContext = createContext<
  { targetRef: Ref<HTMLButtonElement>; toggle: () => void } | undefined
>(undefined);

export function AccountGainLossDetails({
  data,
  loading,
  isArchivedMode,
  children,
}: {
  data?: Pick<AccountGainLossSummaries, "startDate" | "asOfDate">;
  loading: boolean;
  isArchivedMode: boolean;
  children: ReactNode;
}) {
  const locale = useUserLocale();
  const targetRef = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState(false);
  const startDate = data
    ? formatUtcDateForLocale(new Date(data.startDate), locale)
    : undefined;
  const asOfDate = data
    ? formatUtcDateForLocale(new Date(data.asOfDate), locale)
    : undefined;

  return (
    <GainLossDetailsTargetContext.Provider
      value={{ targetRef, toggle: () => setOpened((value) => !value) }}
    >
      {/* Keep the popup visible while AG Grid replaces its trigger. */}
      <Popover
        opened={opened}
        onChange={setOpened}
        width={340}
        position="bottom-end"
        withArrow
        shadow="md"
        withinPortal
        trapFocus
        returnFocus={false}
        closeOnEscape={false}
        hideDetached={false}
        middlewares={{ flip: true, shift: { padding: 12 } }}
      >
        {children}
        <Popover.Dropdown
          aria-label="Gain/Loss Details"
          aria-labelledby={undefined}
          maw="calc(100vw - 24px)"
          onKeyDownCapture={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setOpened(false);
            // Grid updates can replace the trigger while the dialog is open.
            targetRef.current?.focus({ preventScroll: true });
          }}
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
    </GainLossDetailsTargetContext.Provider>
  );
}

export function AccountGainLossHeader({
  displayName,
}: CustomInnerHeaderGroupProps<AccountsGridRow>) {
  const details = useContext(GainLossDetailsTargetContext);
  return (
    <Group gap={4} wrap="nowrap" miw={0}>
      <Text size="sm" truncate>
        {displayName}
      </Text>
      <Popover.Target ref={details?.targetRef}>
        <Tooltip label="Show Gain/Loss Details">
          <ActionIcon
            aria-label="Show Gain/Loss Details"
            size="sm"
            variant="subtle"
            onClick={details?.toggle}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <IconInfoCircle size={16} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
    </Group>
  );
}
