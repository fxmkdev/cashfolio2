import { Stack, Tooltip } from "@mantine/core";
import {
  IconActivity,
  IconCalendarMonth,
  IconChartBar,
  IconDatabase,
  IconListDetails,
} from "@tabler/icons-react";
import type { ReactNode } from "react";
import { LinkNavLink } from "@/components/link-nav-link";
import type { AccountBookSection, AccountsLinkSearch } from "./route";

type AccountBookNavigationLink = {
  section: Exclude<AccountBookSection, "settings">;
  label: string;
  icon: (size: number) => ReactNode;
};

const navigationLinks: AccountBookNavigationLink[] = [
  {
    section: "accounts",
    label: "Accounts",
    icon: (size) => <IconListDetails size={size} />,
  },
  {
    section: "activity",
    label: "Activity",
    icon: (size) => <IconActivity size={size} />,
  },
  {
    section: "period",
    label: "Period",
    icon: (size) => <IconCalendarMonth size={size} />,
  },
  {
    section: "timeline",
    label: "Timeline",
    icon: (size) => <IconChartBar size={size} />,
  },
  {
    section: "valuation-cache",
    label: "Valuation Cache",
    icon: (size) => <IconDatabase size={size} />,
  },
];

type AccountBookNavigationLinksProps = {
  accountBookId: string;
  activeSection: AccountBookSection;
  accountsLinkSearch: AccountsLinkSearch;
  collapsed: boolean;
  onNavigate: () => void;
  periodLinkSearch: {
    period?: string;
  };
};

export function AccountBookNavigationLinks({
  accountBookId,
  activeSection,
  accountsLinkSearch,
  collapsed,
  onNavigate,
  periodLinkSearch,
}: AccountBookNavigationLinksProps) {
  if (collapsed) {
    return (
      <>
        <Stack gap="xs" hiddenFrom="sm">
          {navigationLinks.map((link) => (
            <AccountBookNavigationLinkItem
              key={link.section}
              accountBookId={accountBookId}
              activeSection={activeSection}
              accountsLinkSearch={accountsLinkSearch}
              link={link}
              onNavigate={onNavigate}
              periodLinkSearch={periodLinkSearch}
            />
          ))}
        </Stack>
        <Stack align="center" gap="xs" visibleFrom="sm">
          {navigationLinks.map((link) => (
            <Tooltip key={link.section} label={link.label} position="right">
              <AccountBookNavigationLinkItem
                accountBookId={accountBookId}
                activeSection={activeSection}
                accountsLinkSearch={accountsLinkSearch}
                collapsed
                link={link}
                onNavigate={onNavigate}
                periodLinkSearch={periodLinkSearch}
              />
            </Tooltip>
          ))}
        </Stack>
      </>
    );
  }

  return (
    <Stack gap="xs">
      {navigationLinks.map((link) => (
        <AccountBookNavigationLinkItem
          key={link.section}
          accountBookId={accountBookId}
          activeSection={activeSection}
          accountsLinkSearch={accountsLinkSearch}
          link={link}
          onNavigate={onNavigate}
          periodLinkSearch={periodLinkSearch}
        />
      ))}
    </Stack>
  );
}

type AccountBookNavigationLinkItemProps = {
  accountBookId: string;
  activeSection: AccountBookSection;
  accountsLinkSearch: AccountsLinkSearch;
  collapsed?: boolean;
  link: AccountBookNavigationLink;
  onNavigate: () => void;
  periodLinkSearch: {
    period?: string;
  };
};

function AccountBookNavigationLinkItem({
  accountBookId,
  activeSection,
  accountsLinkSearch,
  collapsed = false,
  link,
  onNavigate,
  periodLinkSearch,
}: AccountBookNavigationLinkItemProps) {
  const sharedProps = {
    "aria-label": collapsed ? link.label : undefined,
    active: activeSection === link.section,
    label: collapsed ? "" : link.label,
    leftSection: link.icon(collapsed ? 18 : 16),
    onClick: onNavigate,
    styles: collapsed
      ? {
          root: { justifyContent: "center", width: 40 },
          section: { marginInlineEnd: 0 },
        }
      : undefined,
  };

  switch (link.section) {
    case "accounts":
      return (
        <LinkNavLink
          {...sharedProps}
          to="/$accountBookId/accounts"
          params={{ accountBookId }}
          search={accountsLinkSearch}
        />
      );
    case "activity":
      return (
        <LinkNavLink
          {...sharedProps}
          to="/$accountBookId/activity"
          params={{ accountBookId }}
          search={periodLinkSearch}
        />
      );
    case "period":
      return (
        <LinkNavLink
          {...sharedProps}
          to="/$accountBookId/period"
          params={{ accountBookId }}
          search={periodLinkSearch}
        />
      );
    case "timeline":
      return (
        <LinkNavLink
          {...sharedProps}
          to="/$accountBookId/timeline"
          params={{ accountBookId }}
        />
      );
    case "valuation-cache":
      return (
        <LinkNavLink
          {...sharedProps}
          to="/$accountBookId/valuation-cache"
          params={{ accountBookId }}
        />
      );
    default:
      return assertNever(link.section);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled account book navigation section: ${value}`);
}
