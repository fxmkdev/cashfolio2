import { Button, Menu } from "@mantine/core";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import type { UserAccountBookOption } from "@/server/home";

type AccountBookSwitcherMenuProps = {
  accountBookId: string;
  accountBooks: UserAccountBookOption[];
  onSelectAccountBook: (accountBookId: string) => void;
};

export function AccountBookSwitcherMenu({
  accountBookId,
  accountBooks,
  onSelectAccountBook,
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

          return (
            <Menu.Item
              key={accountBook.id}
              leftSection={isCurrentBook ? <IconCheck size={16} /> : undefined}
              onClick={() => {
                onSelectAccountBook(accountBook.id);
              }}
            >
              {accountBook.name}
            </Menu.Item>
          );
        })}
        <Menu.Divider />
        <Menu.Item disabled>Create new account book</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
