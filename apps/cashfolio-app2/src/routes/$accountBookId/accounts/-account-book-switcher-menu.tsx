import { Button, Menu, type MenuItemProps } from "@mantine/core";
import { IconCheck, IconChevronDown, IconSettings } from "@tabler/icons-react";
import { createLink } from "@tanstack/react-router";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import type { UserAccountBookOption } from "@/server/home";
import type { AccountsMode, TabValue } from "./-page-types";

const MenuItemLinkBase = forwardRef<
  HTMLAnchorElement,
  Omit<MenuItemProps, "component"> & ComponentPropsWithoutRef<"a">
>(function MenuItemLinkBase(props, ref) {
  return <Menu.Item ref={ref} {...props} component="a" />;
});

const LinkMenuItem = createLink(MenuItemLinkBase);

type AccountBookSwitcherMenuProps = {
  accountBookId: string;
  accountBooks: UserAccountBookOption[];
  tab: TabValue;
  mode: AccountsMode;
};

export function AccountBookSwitcherMenu({
  accountBookId,
  accountBooks,
  tab,
  mode,
}: AccountBookSwitcherMenuProps) {
  const currentAccountBookName =
    accountBooks.find((accountBook) => accountBook.id === accountBookId)
      ?.name ?? accountBookId;

  return (
    <Menu position="bottom-end" withArrow>
      <Menu.Target>
        <Button variant="default" rightSection={<IconChevronDown size={16} />}>
          {currentAccountBookName}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {accountBooks.map((accountBook) => {
          const isCurrentBook = accountBook.id === accountBookId;

          if (isCurrentBook) {
            return (
              <LinkMenuItem
                key={accountBook.id}
                leftSection={<IconCheck size={16} />}
                to="/$accountBookId/accounts"
                params={{ accountBookId }}
                search={{ tab, mode }}
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
            >
              {accountBook.name}
            </LinkMenuItem>
          );
        })}
        <Menu.Divider />
        <LinkMenuItem
          leftSection={<IconSettings size={16} />}
          to="/$accountBookId/settings"
          params={{ accountBookId }}
        >
          Settings
        </LinkMenuItem>
        <Menu.Divider />
        <Menu.Item disabled>Create new account book</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
