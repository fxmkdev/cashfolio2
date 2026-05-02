import { AppShell, Burger, Divider, Group, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  createFileRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import {
  IconCalendarMonth,
  IconChartBar,
  IconDatabase,
  IconListDetails,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { LinkNavLink } from "@/components/link-nav-link";

export const Route = createFileRoute("/$accountBookId")({
  component: AccountBookLayout,
});

export type AccountBookSection =
  | "accounts"
  | "period"
  | "timeline"
  | "valuation-cache";

export function getActiveSection(args: {
  pathname: string;
  accountBookId: string;
}): AccountBookSection {
  const segments = args.pathname.split("/").filter(Boolean);
  if (segments[0] !== args.accountBookId) {
    return "accounts";
  }

  const section = segments[1];
  if (section === "period") return "period";
  if (section === "timeline") return "timeline";
  if (section === "valuation-cache") return "valuation-cache";
  return "accounts";
}

function AccountBookLayout() {
  const { accountBookId } = Route.useParams();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <AccountBookShell accountBookId={accountBookId} pathname={pathname}>
      <Outlet />
    </AccountBookShell>
  );
}

export type AccountBookShellProps = {
  accountBookId: string;
  pathname: string;
  children: ReactNode;
};

export function AccountBookShell({
  accountBookId,
  pathname,
  children,
}: AccountBookShellProps) {
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] =
    useDisclosure(false);
  const activeSection = getActiveSection({ pathname, accountBookId });

  return (
    <AppShell
      padding="md"
      header={{
        height: { base: 56, sm: 0 },
        collapsed: false,
      }}
      navbar={{
        width: 260,
        breakpoint: "sm",
        collapsed: { mobile: !mobileOpened },
      }}
    >
      <AppShell.Header hiddenFrom="sm">
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
            active={activeSection === "accounts"}
            onClick={closeMobile}
          />
          <LinkNavLink
            label="Period"
            leftSection={<IconCalendarMonth size={16} />}
            to="/$accountBookId/period"
            params={{ accountBookId }}
            active={activeSection === "period"}
            onClick={closeMobile}
          />
          <LinkNavLink
            label="Timeline"
            leftSection={<IconChartBar size={16} />}
            to="/$accountBookId/timeline"
            params={{ accountBookId }}
            active={activeSection === "timeline"}
            onClick={closeMobile}
          />
          <LinkNavLink
            label="Valuation Cache"
            leftSection={<IconDatabase size={16} />}
            to="/$accountBookId/valuation-cache"
            params={{ accountBookId }}
            active={activeSection === "valuation-cache"}
            onClick={closeMobile}
          />
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
        }}
      >
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
