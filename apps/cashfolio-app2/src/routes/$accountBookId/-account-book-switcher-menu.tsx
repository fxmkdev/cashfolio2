import {
  ActionIcon,
  Avatar,
  Button,
  Menu,
  Tooltip,
  type MenuItemProps,
} from "@mantine/core";
import {
  IconCheck,
  IconChevronUp,
  IconDatabase,
  IconLogout2,
  IconPlus,
  IconSettings,
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
  collapsed = false,
}: AccountBookSwitcherMenuProps) {
  const currentAccountBookName =
    accountBooks.find((accountBook) => accountBook.id === accountBookId)
      ?.name ?? accountBookId;

  return (
    <Menu position="top-end" width={collapsed ? 260 : "target"}>
      <Menu.Target>
        {collapsed ? (
          <Tooltip label={currentAccountBookName} position="right">
            <ActionIcon
              aria-label={`Switch account book, current: ${currentAccountBookName}`}
              size="lg"
              variant="default"
            >
              <IconDatabase size={18} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <Button
            variant="default"
            rightSection={<IconChevronUp size={16} />}
            fullWidth
          >
            <span style={triggerLabelStyle}>{currentAccountBookName}</span>
          </Button>
        )}
      </Menu.Target>
      <Menu.Dropdown style={{ maxWidth: collapsed ? 260 : "100%" }}>
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
          leftSection={<IconSettings size={16} />}
          to="/$accountBookId/account-book-settings"
          params={{ accountBookId }}
        >
          Account Book Settings
        </LinkMenuItem>
        <Menu.Divider />
        <LinkMenuItem
          leftSection={<IconPlus size={16} />}
          to="/account-books/new"
        >
          Create New
        </LinkMenuItem>
      </Menu.Dropdown>
    </Menu>
  );
}

export function UserMenu({
  accountBookId,
  collapsed = false,
  userProfile,
}: {
  accountBookId: string;
  collapsed?: boolean;
  userProfile: AuthenticatedUserProfile;
}) {
  return (
    <Menu position="top-end" width={collapsed ? 260 : "target"}>
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
      <Menu.Dropdown style={{ maxWidth: collapsed ? 260 : "100%" }}>
        <LinkMenuItem
          leftSection={<IconUserCog size={16} />}
          to="/$accountBookId/user-settings"
          params={{ accountBookId }}
        >
          User Settings
        </LinkMenuItem>
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
      </Menu.Dropdown>
    </Menu>
  );
}
