import { AppShell, Burger, Divider, Group, Stack, Text } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import {
  IconCalendarMonth,
  IconChartBar,
  IconDatabase,
  IconListDetails,
} from "@tabler/icons-react";
import { LinkNavLink } from "@/components/link-nav-link";

export const Route = createFileRoute("/$accountBookId")({
  component: AccountBookLayout,
});

function AccountBookLayout() {
  const { accountBookId } = Route.useParams();
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] =
    useDisclosure(false);
  const isMobile = useMediaQuery("(max-width: 48em)");
  const matchRoute = useMatchRoute();

  const isAccountsActive = Boolean(
    matchRoute({
      to: "/$accountBookId/accounts",
      params: { accountBookId },
      fuzzy: false,
    }),
  );
  const isPeriodActive = Boolean(
    matchRoute({
      to: "/$accountBookId/period",
      params: { accountBookId },
      fuzzy: true,
    }),
  );
  const isTimelineActive = Boolean(
    matchRoute({
      to: "/$accountBookId/timeline",
      params: { accountBookId },
      fuzzy: false,
    }),
  );
  const isValuationCacheActive = Boolean(
    matchRoute({
      to: "/$accountBookId/valuation-cache",
      params: { accountBookId },
      fuzzy: false,
    }),
  );

  return (
    <AppShell
      padding="md"
      header={{
        height: 56,
        collapsed: !isMobile,
      }}
      navbar={{
        width: 260,
        breakpoint: "sm",
        collapsed: { mobile: !mobileOpened },
      }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" align="center">
          <Burger
            opened={mobileOpened}
            onClick={toggleMobile}
            aria-label="Toggle navigation"
            size="sm"
          />
          <Text fw={600}>Navigation</Text>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <Stack gap="xs">
          <Text size="sm" fw={600} c="dimmed" px="xs" pt="xs">
            Account Book
          </Text>
          <Divider />
          <LinkNavLink
            label="Accounts"
            leftSection={<IconListDetails size={16} />}
            to="/$accountBookId/accounts"
            params={{ accountBookId }}
            search={{ tab: "ASSET", mode: "active" }}
            active={isAccountsActive}
            onClick={closeMobile}
          />
          <LinkNavLink
            label="Period"
            leftSection={<IconCalendarMonth size={16} />}
            to="/$accountBookId/period"
            params={{ accountBookId }}
            active={isPeriodActive}
            onClick={closeMobile}
          />
          <LinkNavLink
            label="Timeline"
            leftSection={<IconChartBar size={16} />}
            to="/$accountBookId/timeline"
            params={{ accountBookId }}
            active={isTimelineActive}
            onClick={closeMobile}
          />
          <LinkNavLink
            label="Valuation Cache"
            leftSection={<IconDatabase size={16} />}
            to="/$accountBookId/valuation-cache"
            params={{ accountBookId }}
            active={isValuationCacheActive}
            onClick={closeMobile}
          />
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
