import {
  ActionIcon,
  AppShell,
  Burger,
  Divider,
  Group,
  Stack,
  Text,
  Tooltip,
  type TextProps,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from "@tabler/icons-react";
import { useEffect, useState, type ReactNode } from "react";
import type { AuthenticatedUserProfile } from "@/auth/user-profile";
import type { UserAccountBookOption } from "@/server/home";
import {
  AccountBookAdminNavigationLinks,
  AccountBookNavigationLinks,
} from "./-account-book-navigation-links";
import { consumePendingAccountBookSwitch } from "./-account-book-switch-notification";
import {
  AccountBookSwitcherMenu,
  UserMenu,
} from "./-account-book-switcher-menu";
import {
  DESKTOP_RAIL_COLLAPSED_STORAGE_KEY,
  getActiveSection,
  parseDesktopRailCollapsedPreference,
  type AccountsLinkSearch,
} from "./-route-helpers";
import {
  ACCOUNT_BOOK_RAIL_WIDTH,
  ACCOUNT_BOOK_SIDEBAR_WIDTH,
} from "./-shell-dimensions";

export type AccountBookShellProps = {
  accountSecurityUrl: string | null;
  accountBookId: string;
  currentHref: string;
  pathname: string;
  accountBooks: UserAccountBookOption[];
  appVersion: string;
  userProfile: AuthenticatedUserProfile;
  accountsLinkSearch: AccountsLinkSearch;
  periodLinkSearch: {
    period?: string;
  };
  children: ReactNode;
};

export function AccountBookShell({
  accountSecurityUrl,
  accountBookId,
  currentHref,
  pathname,
  accountBooks,
  appVersion,
  userProfile,
  accountsLinkSearch,
  periodLinkSearch,
  children,
}: AccountBookShellProps) {
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] =
    useDisclosure(false);
  const [desktopRailCollapsed, setDesktopRailCollapsed] = useState(false);
  const [desktopRailPreferenceHydrated, setDesktopRailPreferenceHydrated] =
    useState(false);
  const activeSection = getActiveSection({ pathname, accountBookId });
  const accountBookSwitcherMenuProps = {
    accountBookId,
    accountBooks,
    accountsTab: accountsLinkSearch.tab,
    accountsMode: accountsLinkSearch.mode,
    createNewReturnTo: currentHref,
  };
  const toggleDesktopRail = () =>
    setDesktopRailCollapsed((isCollapsed) => !isCollapsed);
  const desktopRailToggle = (
    <Tooltip
      label={desktopRailCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      position="right"
    >
      <ActionIcon
        aria-label={
          desktopRailCollapsed ? "Expand Sidebar" : "Collapse Sidebar"
        }
        onClick={toggleDesktopRail}
        variant="subtle"
        visibleFrom="sm"
      >
        {desktopRailCollapsed ? (
          <IconLayoutSidebarLeftExpand size={18} />
        ) : (
          <IconLayoutSidebarLeftCollapse size={18} />
        )}
      </ActionIcon>
    </Tooltip>
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      setDesktopRailCollapsed(
        parseDesktopRailCollapsedPreference(
          window.localStorage.getItem(DESKTOP_RAIL_COLLAPSED_STORAGE_KEY),
        ),
      );
    } catch {
      setDesktopRailCollapsed(false);
    } finally {
      setDesktopRailPreferenceHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!desktopRailPreferenceHydrated || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        DESKTOP_RAIL_COLLAPSED_STORAGE_KEY,
        desktopRailCollapsed ? "true" : "false",
      );
    } catch {
      // Ignore storage persistence failures so navigation remains usable.
    }
  }, [desktopRailCollapsed, desktopRailPreferenceHydrated]);

  useEffect(() => {
    const pendingAccountBookSwitch =
      consumePendingAccountBookSwitch(accountBookId);

    if (!pendingAccountBookSwitch) {
      return;
    }

    notifications.show({
      color: "green",
      icon: <IconCheck size={16} />,
      title: "Account book switched",
      message: `Now viewing ${pendingAccountBookSwitch.accountBookName}.`,
      withBorder: true,
    });
  }, [accountBookId]);

  return (
    <AppShell
      padding="md"
      header={{
        height: { base: 56, sm: 0 },
        collapsed: false,
      }}
      navbar={{
        width: {
          base: ACCOUNT_BOOK_SIDEBAR_WIDTH,
          sm: desktopRailCollapsed
            ? ACCOUNT_BOOK_RAIL_WIDTH
            : ACCOUNT_BOOK_SIDEBAR_WIDTH,
        },
        breakpoint: "sm",
        collapsed: { mobile: !mobileOpened, desktop: false },
      }}
    >
      <AppShell.Header hiddenFrom="sm">
        <Group h="100%" px="md" align="center">
          <Burger
            opened={mobileOpened}
            onClick={toggleMobile}
            aria-label="Toggle Navigation"
            size="sm"
          />
          <CashfolioTitle appVersion={appVersion} />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar
        p={{ base: "sm", sm: desktopRailCollapsed ? "xs" : "sm" }}
      >
        <AppShell.Section grow>
          <Stack gap="xs">
            {desktopRailCollapsed ? (
              <>
                <Group px="xs" pt="xs" wrap="nowrap" hiddenFrom="sm">
                  <CashfolioTitle appVersion={appVersion} size="xl" />
                </Group>
                <Group justify="center" pt="xs" visibleFrom="sm">
                  {desktopRailToggle}
                </Group>
              </>
            ) : (
              <Group
                align="center"
                gap="xs"
                justify="space-between"
                px="xs"
                pt="xs"
                wrap="nowrap"
              >
                <CashfolioTitle appVersion={appVersion} size="xl" />
                {desktopRailToggle}
              </Group>
            )}
            {desktopRailCollapsed ? (
              <>
                <Stack gap="xs" hiddenFrom="sm">
                  <AccountBookSwitcherMenu {...accountBookSwitcherMenuProps} />
                </Stack>
                <Group justify="center" visibleFrom="sm">
                  <AccountBookSwitcherMenu
                    {...accountBookSwitcherMenuProps}
                    collapsed
                  />
                </Group>
              </>
            ) : (
              <AccountBookSwitcherMenu {...accountBookSwitcherMenuProps} />
            )}
            <Divider />
            <AccountBookNavigationLinks
              accountBookId={accountBookId}
              activeSection={activeSection}
              accountsLinkSearch={accountsLinkSearch}
              collapsed={desktopRailCollapsed}
              onNavigate={closeMobile}
              periodLinkSearch={periodLinkSearch}
            />
          </Stack>
        </AppShell.Section>

        <AppShell.Section>
          <Stack gap="xs" pt="sm">
            <AccountBookAdminNavigationLinks
              accountBookId={accountBookId}
              activeSection={activeSection}
              accountsLinkSearch={accountsLinkSearch}
              collapsed={desktopRailCollapsed}
              onNavigate={closeMobile}
              periodLinkSearch={periodLinkSearch}
            />
            <Divider />
            {desktopRailCollapsed ? (
              <>
                <Stack gap="xs" hiddenFrom="sm">
                  <UserMenu
                    accountSecurityUrl={accountSecurityUrl}
                    accountBookId={accountBookId}
                    userProfile={userProfile}
                  />
                </Stack>
                <Group justify="center" visibleFrom="sm">
                  <UserMenu
                    accountSecurityUrl={accountSecurityUrl}
                    accountBookId={accountBookId}
                    userProfile={userProfile}
                    collapsed
                  />
                </Group>
              </>
            ) : (
              <UserMenu
                accountSecurityUrl={accountSecurityUrl}
                accountBookId={accountBookId}
                userProfile={userProfile}
              />
            )}
          </Stack>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100dvh",
          minHeight: 0,
        }}
      >
        {children}
      </AppShell.Main>
    </AppShell>
  );
}

type CashfolioTitleProps = {
  appVersion: string;
  size?: TextProps["size"];
  px?: TextProps["px"];
  pt?: TextProps["pt"];
};

function CashfolioTitle({ appVersion, size, px, pt }: CashfolioTitleProps) {
  return (
    <Tooltip label={`Version ${appVersion}`}>
      <Text
        aria-label={`Cashfolio, version ${appVersion}`}
        component="span"
        fw={600}
        px={px}
        pt={pt}
        size={size}
        style={{
          cursor: "help",
          display: "inline-flex",
          outlineOffset: 2,
        }}
        tabIndex={0}
      >
        Cashfolio
      </Text>
    </Tooltip>
  );
}
