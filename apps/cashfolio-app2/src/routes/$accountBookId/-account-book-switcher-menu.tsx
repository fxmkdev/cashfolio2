import {
  ActionIcon,
  Avatar,
  Button,
  Menu,
  Tooltip,
  type MenuItemProps,
} from "@mantine/core";
import {
  IconBook2,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconExternalLink,
  IconLogout2,
  IconPlus,
  IconShieldLock,
  IconUserCog,
} from "@tabler/icons-react";
import { createLink } from "@tanstack/react-router";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type MouseEvent,
} from "react";
import type { AuthenticatedUserProfile } from "@/auth/user-profile";
import type { UserAccountBookOption } from "@/server/home";
import { markPendingAccountBookSwitch } from "./-account-book-switch-notification";
import { ACCOUNT_BOOK_SIDEBAR_WIDTH } from "./-shell-dimensions";
import type { AccountsMode, TabValue } from "./accounts/-page-types";

const MenuItemLinkBase = forwardRef<
  HTMLAnchorElement,
  Omit<MenuItemProps, "component"> & ComponentPropsWithoutRef<"a">
>(function MenuItemLinkBase(props, ref) {
  return <Menu.Item ref={ref} {...props} component="a" />;
});

const LinkMenuItem = createLink(MenuItemLinkBase);

const triggerLabelStyle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

type AccountBookSwitcherMenuProps = {
  accountBookId: string;
  accountBooks: UserAccountBookOption[];
  accountsTab: TabValue;
  accountsMode: AccountsMode;
  createNewReturnTo: string;
  collapsed?: boolean;
};

function handleAccountBookSwitchClick(
  event: MouseEvent<HTMLAnchorElement>,
  accountBook: UserAccountBookOption,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  markPendingAccountBookSwitch({
    accountBookId: accountBook.id,
    accountBookName: accountBook.name,
  });
}

export function AccountBookSwitcherMenu({
  accountBookId,
  accountBooks,
  accountsTab,
  accountsMode,
  createNewReturnTo,
  collapsed = false,
}: AccountBookSwitcherMenuProps) {
  const currentAccountBookName =
    accountBooks.find((accountBook) => accountBook.id === accountBookId)
      ?.name ?? accountBookId;

  return (
    <Menu
      position="bottom-start"
      width={collapsed ? ACCOUNT_BOOK_SIDEBAR_WIDTH : "target"}
    >
      <Menu.Target>
        {collapsed ? (
          <Tooltip label={currentAccountBookName} position="right">
            <ActionIcon
              aria-label={`Switch account book, current: ${currentAccountBookName}`}
              size="lg"
              variant="default"
            >
              <IconBook2 size={18} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <Button
            variant="default"
            rightSection={<IconChevronDown size={16} />}
            fullWidth
          >
            <span style={triggerLabelStyle}>{currentAccountBookName}</span>
          </Button>
        )}
      </Menu.Target>
      <Menu.Dropdown
        style={{ maxWidth: collapsed ? ACCOUNT_BOOK_SIDEBAR_WIDTH : "100%" }}
      >
        {accountBooks.map((accountBook) => {
          const isCurrentBook = accountBook.id === accountBookId;

          if (isCurrentBook) {
            return (
              <LinkMenuItem
                key={accountBook.id}
                leftSection={<IconCheck size={16} />}
                to="/$accountBookId/accounts"
                params={{ accountBookId }}
                search={{ tab: accountsTab, mode: accountsMode }}
              >
                {accountBook.name}
              </LinkMenuItem>
            );
          }

          return (
            <LinkMenuItem
              key={accountBook.id}
              to="/$accountBookId"
              params={{ accountBookId: accountBook.id }}
              onClick={(event) =>
                handleAccountBookSwitchClick(event, accountBook)
              }
            >
              {accountBook.name}
            </LinkMenuItem>
          );
        })}
        <Menu.Divider />
        <LinkMenuItem
          leftSection={<IconPlus size={16} />}
          to="/account-books/new"
          search={{ returnTo: createNewReturnTo }}
        >
          Create New
        </LinkMenuItem>
      </Menu.Dropdown>
    </Menu>
  );
}

export function UserMenuItems({
  accountBookId,
  accountSecurityUrl,
}: {
  accountBookId: string;
  accountSecurityUrl: string | null;
}) {
  return (
    <>
      <LinkMenuItem
        leftSection={<IconUserCog size={16} />}
        to="/$accountBookId/user-settings"
        params={{ accountBookId }}
        preload={false}
      >
        User Settings
      </LinkMenuItem>
      {accountSecurityUrl && (
        <Menu.Item
          component="a"
          href={accountSecurityUrl}
          target="_blank"
          rel="noopener noreferrer"
          leftSection={<IconShieldLock size={16} />}
          rightSection={<IconExternalLink size={16} />}
        >
          Account Security
        </Menu.Item>
      )}
      <Menu.Divider />
      <form action="/api/logto/sign-out" method="post">
        <Menu.Item
          component="button"
          type="submit"
          leftSection={<IconLogout2 size={16} />}
        >
          Sign Out
        </Menu.Item>
      </form>
    </>
  );
}

export function UserMenu({
  accountSecurityUrl,
  accountBookId,
  collapsed = false,
  userProfile,
}: {
  accountSecurityUrl: string | null;
  accountBookId: string;
  collapsed?: boolean;
  userProfile: AuthenticatedUserProfile;
}) {
  return (
    <Menu
      position="top-end"
      width={collapsed ? ACCOUNT_BOOK_SIDEBAR_WIDTH : "target"}
    >
      <Menu.Target>
        {collapsed ? (
          <Tooltip label={userProfile.displayName} position="right">
            <ActionIcon
              aria-label={`Open user menu, current: ${userProfile.displayName}`}
              size="lg"
              variant="default"
            >
              <Avatar src={userProfile.avatarUrl} alt="" size={24} radius="xl">
                {userProfile.initials}
              </Avatar>
            </ActionIcon>
          </Tooltip>
        ) : (
          <Button
            variant="default"
            leftSection={
              <Avatar src={userProfile.avatarUrl} alt="" size={24} radius="xl">
                {userProfile.initials}
              </Avatar>
            }
            rightSection={<IconChevronUp size={16} />}
            fullWidth
          >
            <span style={triggerLabelStyle}>{userProfile.displayName}</span>
          </Button>
        )}
      </Menu.Target>
      <Menu.Dropdown
        style={{ maxWidth: collapsed ? ACCOUNT_BOOK_SIDEBAR_WIDTH : "100%" }}
      >
        <UserMenuItems
          accountBookId={accountBookId}
          accountSecurityUrl={accountSecurityUrl}
        />
      </Menu.Dropdown>
    </Menu>
  );
}
