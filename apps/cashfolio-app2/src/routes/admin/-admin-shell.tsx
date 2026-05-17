import {
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
import { IconArrowLeft, IconLayoutDashboard } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { AuthenticatedUserProfile } from "@/auth/user-profile";
import { LinkNavLink } from "@/components/link-nav-link";
import { UserMenu } from "../-user-menu";
import { ACCOUNT_BOOK_SIDEBAR_WIDTH } from "../$accountBookId/-shell-dimensions";

export type AdminShellProps = {
  accountSecurityUrl: string | null;
  appVersion: string;
  children: ReactNode;
  userProfile: AuthenticatedUserProfile;
};

export function AdminShell({
  accountSecurityUrl,
  appVersion,
  children,
  userProfile,
}: AdminShellProps) {
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] =
    useDisclosure(false);

  return (
    <AppShell
      padding="md"
      header={{
        height: { base: 56, sm: 0 },
        collapsed: false,
      }}
      navbar={{
        width: ACCOUNT_BOOK_SIDEBAR_WIDTH,
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

      <AppShell.Navbar p="sm">
        <AppShell.Section grow>
          <Stack gap="xs">
            <Group
              align="center"
              gap="xs"
              justify="space-between"
              px="xs"
              pt="xs"
              wrap="nowrap"
            >
              <CashfolioTitle appVersion={appVersion} size="xl" />
            </Group>
            <Divider />
            <Stack gap="xs">
              <LinkNavLink
                leftSection={<IconLayoutDashboard size={16} />}
                label="Overview"
                onClick={closeMobile}
                to="/admin"
              />
            </Stack>
          </Stack>
        </AppShell.Section>

        <AppShell.Section>
          <Stack gap="xs" pt="sm">
            <LinkNavLink
              label="Back to App"
              leftSection={<IconArrowLeft size={16} />}
              onClick={closeMobile}
              to="/"
            />
            <Divider />
            <UserMenu
              accountSecurityUrl={accountSecurityUrl}
              userProfile={userProfile}
              userSettingsReturnTo="/admin"
            />
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
};

function CashfolioTitle({ appVersion, size }: CashfolioTitleProps) {
  return (
    <Tooltip label={`Version ${appVersion}`}>
      <Text
        aria-label={`Cashfolio Admin, version ${appVersion}`}
        component="span"
        fw={600}
        size={size}
        style={{
          cursor: "help",
          display: "inline-flex",
          outlineOffset: 2,
        }}
        tabIndex={0}
      >
        Cashfolio Admin
      </Text>
    </Tooltip>
  );
}
