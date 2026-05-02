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
import { AccountType, EquityAccountSubtype } from "@/.prisma-client/enums";
import { LinkNavLink } from "@/components/link-nav-link";
import type { TabValue } from "@/shared/account-tabs";
import type { AccountsMode } from "./accounts/-page-types";

export const Route = createFileRoute("/$accountBookId")({
  component: AccountBookLayout,
});

export type AccountBookSection =
  | "accounts"
  | "period"
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

type RouterMatchSnapshot = {
  routeId: string;
  loaderData: unknown;
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
  if (section === "timeline") return "timeline";
  if (section === "valuation-cache") return "valuation-cache";
  return "accounts";
}

function parseAccountsTab(value: unknown): TabValue | null {
  if (
    value === "ASSET" ||
    value === "LIABILITY" ||
    value === "EQUITY-INCOME" ||
    value === "EQUITY-EXPENSE"
  ) {
    return value;
  }
  return null;
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
  if (typeof account !== "object" || account === null) {
    return false;
  }

  const candidate = account as {
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
  const modeFromSearch = args.locationSearch.mode;
  if (
    tabFromSearch &&
    (modeFromSearch === "active" || modeFromSearch === "archived")
  ) {
    return {
      tab: tabFromSearch,
      mode: modeFromSearch,
    };
  }

  for (let index = args.matches.length - 1; index >= 0; index -= 1) {
    const match = args.matches[index];
    if (match.routeId !== "/$accountBookId/$accountId") {
      continue;
    }

    if (!hasLedgerAccountLoaderData(match.loaderData)) {
      continue;
    }

    return {
      tab: getAccountsTabFromLedgerAccount(match.loaderData.account),
      mode: match.loaderData.account.isActive ? "active" : "archived",
    };
  }

  return DEFAULT_ACCOUNTS_LINK_SEARCH;
}

function AccountBookLayout() {
  const { accountBookId } = Route.useParams();
  const { pathname, locationSearch, matches } = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      locationSearch: state.location.search as Record<string, unknown>,
      matches: state.matches.map((match) => ({
        routeId: match.routeId,
        loaderData: match.loaderData,
      })),
    }),
  });
  const accountsLinkSearch = getAccountsLinkSearch({
    locationSearch,
    matches,
  });

  return (
    <AccountBookShell
      accountBookId={accountBookId}
      pathname={pathname}
      accountsLinkSearch={accountsLinkSearch}
    >
      <Outlet />
    </AccountBookShell>
  );
}

export type AccountBookShellProps = {
  accountBookId: string;
  pathname: string;
  accountsLinkSearch: AccountsLinkSearch;
  children: ReactNode;
};

export function AccountBookShell({
  accountBookId,
  pathname,
  accountsLinkSearch,
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
            search={accountsLinkSearch}
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
          height:
            "calc(100dvh - var(--app-shell-header-offset) - var(--mantine-spacing-md) - var(--mantine-spacing-md))",
          minHeight: 0,
        }}
      >
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
