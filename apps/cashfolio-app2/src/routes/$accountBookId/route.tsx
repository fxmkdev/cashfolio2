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
import { notifications } from "@mantine/notifications";
import {
  createFileRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import {
  IconCalendarMonth,
  IconCheck,
  IconChartBar,
  IconDatabase,
  IconListDetails,
} from "@tabler/icons-react";
import { useEffect, type ReactNode } from "react";
import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import { LinkNavLink } from "@/components/link-nav-link";
import type { UserAccountBookOption } from "@/server/home";
import { consumePendingAccountBookSwitch } from "./-account-book-switch-notification";
import { AccountBookSwitcherMenu } from "./-account-book-switcher-menu";
import {
  parseAccountsSearch,
  tabs,
  type AccountsMode,
  type TabValue,
} from "./accounts/-page-types";

export const Route = createFileRoute("/$accountBookId")({
  loader: async () => {
    const [
      { loadUserAccountBooksForAccountBookRoute },
      { getRuntimeAppVersion },
    ] = await Promise.all([
      import("./-account-book-options-loader"),
      import("@/server/app-version"),
    ]);

    const [accountBooks, appVersion] = await Promise.all([
      loadUserAccountBooksForAccountBookRoute(),
      getRuntimeAppVersion(),
    ]);

    return { accountBooks, appVersion };
  },
  component: AccountBookLayout,
});

export type AccountBookSection =
  | "accounts"
  | "period"
  | "settings"
  | "timeline"
  | "valuation-cache";

export type AccountsLinkSearch = {
  tab: TabValue;
  mode: AccountsMode;
};

const DEFAULT_ACCOUNTS_LINK_SEARCH: AccountsLinkSearch = {
  tab: "ASSET",
  mode: "active",
};

const LEDGER_ROUTE_IDS = new Set([
  "/$accountBookId/$accountId",
  "/$accountBookId/$accountId/",
  "/$accountId",
]);

type RouterMatchSnapshot = {
  routeId: string;
  account: unknown;
};

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
  if (section === "settings") return "settings";
  if (section === "timeline") return "timeline";
  if (section === "valuation-cache") return "valuation-cache";
  return "accounts";
}

function parseAccountsTab(value: unknown): TabValue | null {
  return typeof value === "string" && tabs.some((tab) => tab.value === value)
    ? (value as TabValue)
    : null;
}

function getPeriodLinkSearch(search: Record<string, unknown>): {
  period?: string;
} {
  return typeof search.period === "string" ? { period: search.period } : {};
}

function isLedgerAccount(value: unknown): value is {
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
  isActive: boolean;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as {
    type?: unknown;
    equityAccountSubtype?: unknown;
    isActive?: unknown;
  };

  const hasValidType =
    candidate.type === AccountType.ASSET ||
    candidate.type === AccountType.LIABILITY ||
    candidate.type === AccountType.EQUITY;
  const hasValidEquitySubtype =
    candidate.equityAccountSubtype === null ||
    candidate.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS ||
    candidate.equityAccountSubtype === EquityAccountSubtype.OPENING_BALANCES ||
    candidate.equityAccountSubtype === EquityAccountSubtype.INCOME ||
    candidate.equityAccountSubtype === EquityAccountSubtype.EXPENSE;

  return (
    hasValidType &&
    hasValidEquitySubtype &&
    typeof candidate.isActive === "boolean"
  );
}

function hasLedgerAccountLoaderData(value: unknown): value is {
  account: {
    type: AccountType;
    equityAccountSubtype: EquityAccountSubtype | null;
    isActive: boolean;
  };
} {
  if (typeof value !== "object" || value === null || !("account" in value)) {
    return false;
  }

  const account = (value as { account: unknown }).account;
  return isLedgerAccount(account);
}

function getAccountsTabFromLedgerAccount(account: {
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
}): TabValue {
  if (account.type === AccountType.ASSET) {
    return "ASSET";
  }
  if (account.type === AccountType.LIABILITY) {
    return "LIABILITY";
  }
  if (account.equityAccountSubtype === EquityAccountSubtype.INCOME) {
    return "EQUITY-INCOME";
  }
  if (account.equityAccountSubtype === EquityAccountSubtype.EXPENSE) {
    return "EQUITY-EXPENSE";
  }
  return "ASSET";
}

export function getAccountsLinkSearch(args: {
  locationSearch: Record<string, unknown>;
  matches: readonly RouterMatchSnapshot[];
}): AccountsLinkSearch {
  const tabFromSearch = parseAccountsTab(args.locationSearch.tab);
  if (tabFromSearch) {
    return parseAccountsSearch({
      tab: tabFromSearch,
      mode: args.locationSearch.mode,
    });
  }

  for (let index = args.matches.length - 1; index >= 0; index -= 1) {
    const match = args.matches[index];
    if (!LEDGER_ROUTE_IDS.has(match.routeId)) {
      continue;
    }

    if (!isLedgerAccount(match.account)) {
      continue;
    }

    return {
      tab: getAccountsTabFromLedgerAccount(match.account),
      mode: match.account.isActive ? "active" : "archived",
    };
  }

  return DEFAULT_ACCOUNTS_LINK_SEARCH;
}

function AccountBookLayout() {
  const { accountBooks, appVersion } = Route.useLoaderData();
  const { accountBookId } = Route.useParams();
  const { pathname, locationSearch, matches } = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      locationSearch: state.location.search as Record<string, unknown>,
      matches: state.matches.map((match) => ({
        routeId: match.routeId,
        account: hasLedgerAccountLoaderData(match.loaderData)
          ? match.loaderData.account
          : null,
      })),
    }),
  });
  const accountsLinkSearch = getAccountsLinkSearch({
    locationSearch,
    matches,
  });
  const periodLinkSearch = getPeriodLinkSearch(locationSearch);

  return (
    <AccountBookShell
      accountBookId={accountBookId}
      pathname={pathname}
      accountBooks={accountBooks}
      appVersion={appVersion}
      accountsLinkSearch={accountsLinkSearch}
      periodLinkSearch={periodLinkSearch}
    >
      <Outlet />
    </AccountBookShell>
  );
}

export type AccountBookShellProps = {
  accountBookId: string;
  pathname: string;
  accountBooks: UserAccountBookOption[];
  appVersion: string;
  accountsLinkSearch: AccountsLinkSearch;
  periodLinkSearch: {
    period?: string;
  };
  children: ReactNode;
};

export function AccountBookShell({
  accountBookId,
  pathname,
  accountBooks,
  appVersion,
  accountsLinkSearch,
  periodLinkSearch,
  children,
}: AccountBookShellProps) {
  const [mobileOpened, { toggle: toggleMobile, close: closeMobile }] =
    useDisclosure(false);
  const activeSection = getActiveSection({ pathname, accountBookId });

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
          <CashfolioTitle appVersion={appVersion} />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <AppShell.Section grow>
          <Stack gap="xs">
            <CashfolioTitle appVersion={appVersion} size="xl" px="xs" pt="xs" />
            <Divider />
            <LinkNavLink
              label="Accounts"
              leftSection={<IconListDetails size={16} />}
              to="/$accountBookId/accounts"
              params={{ accountBookId }}
              search={accountsLinkSearch}
              active={activeSection === "accounts"}
              onClick={closeMobile}
            />
            <LinkNavLink
              label="Period"
              leftSection={<IconCalendarMonth size={16} />}
              to="/$accountBookId/period"
              params={{ accountBookId }}
              search={periodLinkSearch}
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
        </AppShell.Section>

        <AppShell.Section>
          <Stack gap="xs" pt="sm">
            <Divider />
            <AccountBookSwitcherMenu
              accountBookId={accountBookId}
              accountBooks={accountBooks}
              accountsTab={accountsLinkSearch.tab}
              accountsMode={accountsLinkSearch.mode}
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
