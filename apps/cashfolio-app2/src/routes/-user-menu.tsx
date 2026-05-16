import {
  ActionIcon,
  Avatar,
  Button,
  Menu,
  Tooltip,
  type MenuItemProps,
} from "@mantine/core";
import {
  IconChevronUp,
  IconExternalLink,
  IconLogout2,
  IconShieldLock,
  IconUserCog,
} from "@tabler/icons-react";
import { createLink } from "@tanstack/react-router";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import type { AuthenticatedUserProfile } from "@/auth/user-profile";
import { ACCOUNT_BOOK_SIDEBAR_WIDTH } from "./$accountBookId/-shell-dimensions";

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

export function UserMenuItems({
  accountSecurityUrl,
  userSettingsReturnTo,
}: {
  accountSecurityUrl: string | null;
  userSettingsReturnTo: string;
}) {
  return (
    <>
      <LinkMenuItem
        leftSection={<IconUserCog size={16} />}
        to="/user-settings"
        search={{ returnTo: userSettingsReturnTo }}
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
  collapsed = false,
  userProfile,
  userSettingsReturnTo,
}: {
  accountSecurityUrl: string | null;
  collapsed?: boolean;
  userProfile: AuthenticatedUserProfile;
  userSettingsReturnTo: string;
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
          accountSecurityUrl={accountSecurityUrl}
          userSettingsReturnTo={userSettingsReturnTo}
        />
      </Menu.Dropdown>
    </Menu>
  );
}
