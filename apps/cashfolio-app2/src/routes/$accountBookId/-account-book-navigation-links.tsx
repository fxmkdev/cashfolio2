import { NavLink, Stack, Text, Tooltip } from "@mantine/core";
import {
  IconActivity,
  IconCalendarMonth,
  IconChartBar,
  IconDatabase,
  IconExternalLink,
  IconListDetails,
  IconSettings,
} from "@tabler/icons-react";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { LinkNavLink } from "@/components/link-nav-link";
import type { AccountBookSection, AccountsLinkSearch } from "./-route-helpers";

type AccountBookNavigationLink = {
  section: AccountBookSection;
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
    label: "Transactions",
    icon: (size) => <IconActivity size={size} />,
  },
  {
    section: "period",
    label: "Report",
    icon: (size) => <IconCalendarMonth size={size} />,
  },
  {
    section: "timeline",
    label: "History",
    icon: (size) => <IconChartBar size={size} />,
  },
];

const adminNavigationLinks: AccountBookNavigationLink[] = [
  {
    section: "valuation-cache",
    label: "Valuation Cache",
    icon: (size) => <IconDatabase size={size} />,
  },
  {
    section: "settings",
    label: "Settings",
    icon: (size) => <IconSettings size={size} />,
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
  return (
    <AccountBookNavigationLinkList
      accountBookId={accountBookId}
      activeSection={activeSection}
      accountsLinkSearch={accountsLinkSearch}
      collapsed={collapsed}
      links={navigationLinks}
      onNavigate={onNavigate}
      periodLinkSearch={periodLinkSearch}
    />
  );
}

export function AccountBookAdminNavigationLinks({
  accountBookId,
  activeSection,
  accountsLinkSearch,
  collapsed,
  onNavigate,
  periodLinkSearch,
}: AccountBookNavigationLinksProps) {
  return (
    <Stack gap="xs">
      <AccountBookNavigationLinkList
        accountBookId={accountBookId}
        activeSection={activeSection}
        accountsLinkSearch={accountsLinkSearch}
        collapsed={collapsed}
        links={adminNavigationLinks}
        onNavigate={onNavigate}
        periodLinkSearch={periodLinkSearch}
        sectionLabel="Admin"
      />
      <AccountBookAdminRootLink collapsed={collapsed} onNavigate={onNavigate} />
    </Stack>
  );
}

function AccountBookAdminRootLink({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const renderLink = () => (
    <NavLink
      aria-label={collapsed ? "Admin" : undefined}
      component="a"
      href="/admin"
      label={collapsed ? "" : "Admin"}
      leftSection={<IconSettings size={collapsed ? 18 : 16} />}
      onClick={onNavigate}
      rel="noopener noreferrer"
      rightSection={collapsed ? undefined : <IconExternalLink size={14} />}
      styles={
        collapsed
          ? {
              root: { justifyContent: "center", width: 40 },
              section: { marginInlineEnd: 0 },
            }
          : undefined
      }
      target="_blank"
    />
  );

  if (collapsed) {
    return (
      <>
        <Stack gap="xs" hiddenFrom="sm">
          {renderLink()}
        </Stack>
        <Stack align="center" gap="xs" visibleFrom="sm">
          <Tooltip label="Admin" position="right">
            {renderLink()}
          </Tooltip>
        </Stack>
      </>
    );
  }

  return renderLink();
}

type AccountBookNavigationLinkListProps = AccountBookNavigationLinksProps & {
  links: AccountBookNavigationLink[];
  sectionLabel?: string;
};

function AccountBookNavigationLinkList({
  accountBookId,
  activeSection,
  accountsLinkSearch,
  collapsed,
  links,
  onNavigate,
  periodLinkSearch,
  sectionLabel,
}: AccountBookNavigationLinkListProps) {
  if (collapsed) {
    return (
      <>
        <Stack gap="xs" hiddenFrom="sm">
          {sectionLabel ? (
            <Text c="dimmed" fw={600} px="xs" size="xs">
              {sectionLabel}
            </Text>
          ) : null}
          {links.map((link) => (
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
          {links.map((link) => (
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
      {sectionLabel ? (
        <Text c="dimmed" fw={600} px="xs" size="xs">
          {sectionLabel}
        </Text>
      ) : null}
      {links.map((link) => (
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

type AccountBookNavigationLinkItemOwnProps = {
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

type AccountBookNavigationLinkItemProps =
  AccountBookNavigationLinkItemOwnProps &
    Pick<
      ComponentPropsWithoutRef<"a">,
      | "aria-describedby"
      | "className"
      | "onBlur"
      | "onFocus"
      | "onMouseEnter"
      | "onMouseLeave"
      | "onMouseMove"
      | "onPointerEnter"
      | "onPointerLeave"
      | "onTouchStart"
      | "style"
      | "tabIndex"
    >;

const AccountBookNavigationLinkItem = forwardRef<
  HTMLAnchorElement,
  AccountBookNavigationLinkItemProps
>(function AccountBookNavigationLinkItem(
  {
    accountBookId,
    activeSection,
    accountsLinkSearch,
    collapsed = false,
    link,
    onNavigate,
    periodLinkSearch,
    ...triggerProps
  },
  ref,
) {
  const sharedProps = {
    ...triggerProps,
    "aria-label": collapsed ? link.label : undefined,
    active: activeSection === link.section,
    label: collapsed ? "" : link.label,
    leftSection: link.icon(collapsed ? 18 : 16),
    onClick: onNavigate,
    ref,
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
    case "settings":
      return (
        <LinkNavLink
          {...sharedProps}
          to="/$accountBookId/settings"
          params={{ accountBookId }}
        />
      );
    default:
      return assertNever(link.section);
  }
});

function assertNever(value: never): never {
  throw new Error(`Unhandled account book navigation section: ${value}`);
}
