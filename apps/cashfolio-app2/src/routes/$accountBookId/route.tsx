import { AppShell, Group } from "@mantine/core";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { LinkNavLink } from "@/components/link-nav-link";
import { getAccountBookTopNavigationSection } from "./-top-navigation";

export const Route = createFileRoute("/$accountBookId")({
  component: AccountBookLayout,
});

function AccountBookLayout() {
  const { accountBookId } = Route.useParams();
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const activeSection = getAccountBookTopNavigationSection({
    accountBookId,
    pathname,
  });

  return (
    <AppShell header={{ height: 56 }}>
      <AppShell.Header>
        <Group
          h="100%"
          px="md"
          gap="xs"
          wrap="nowrap"
          style={{ overflowX: "auto" }}
        >
          <LinkNavLink
            label="Accounts"
            to="/$accountBookId/accounts"
            params={{ accountBookId }}
            search={{ tab: "ASSET", mode: "active" }}
            active={activeSection === "accounts"}
          />
          <LinkNavLink
            label="Period"
            to="/$accountBookId/period"
            params={{ accountBookId }}
            active={activeSection === "period"}
          />
          <LinkNavLink
            label="Timeline"
            to="/$accountBookId/timeline"
            params={{ accountBookId }}
            active={activeSection === "timeline"}
          />
          <LinkNavLink
            label="Valuation Cache"
            to="/$accountBookId/valuation-cache"
            params={{ accountBookId }}
            active={activeSection === "valuation-cache"}
          />
        </Group>
      </AppShell.Header>

      <AppShell.Main
        style={{
          minHeight: "calc(100dvh - var(--app-shell-header-height))",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
