import { ActionIcon, Avatar, Button, Menu, Tooltip } from "@mantine/core";
import { IconArrowLeft, IconLogout2 } from "@tabler/icons-react";
import type { AuthenticatedUserProfile } from "@/auth/user-profile";
import type { UserAccountBookOption } from "@/server/home";

export type NewAccountBookReturnTarget = {
  accountBookName: string;
  href: string;
};

export function resolveNewAccountBookReturnTarget({
  accountBooks,
  returnTo,
}: {
  accountBooks: UserAccountBookOption[];
  returnTo: string | undefined;
}): NewAccountBookReturnTarget | null {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(returnTo, "https://cashfolio.local");
  } catch {
    return null;
  }

  if (url.origin !== "https://cashfolio.local") {
    return null;
  }

  const accountBookId = url.pathname.split("/").filter(Boolean)[0];
  const accountBook = accountBooks.find(({ id }) => id === accountBookId);
  if (!accountBook) {
    return null;
  }

  return {
    accountBookName: accountBook.name,
    href: `${url.pathname}${url.search}${url.hash}`,
  };
}

export function NewAccountBookPageActions({
  returnTarget,
  userProfile,
}: {
  returnTarget: NewAccountBookReturnTarget | null;
  userProfile: AuthenticatedUserProfile;
}) {
  if (returnTarget) {
    return (
      <Button
        component="a"
        href={returnTarget.href}
        leftSection={<IconArrowLeft size={16} />}
        variant="default"
      >
        Back to {returnTarget.accountBookName}
      </Button>
    );
  }

  return (
    <Menu position="bottom-end" width={220}>
      <Menu.Target>
        <Tooltip label={userProfile.displayName}>
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
      </Menu.Target>
      <Menu.Dropdown>
        <NewAccountBookSignOutMenuItem />
      </Menu.Dropdown>
    </Menu>
  );
}

export function NewAccountBookSignOutMenuItem() {
  return (
    <form action="/api/logto/sign-out" method="post">
      <Menu.Item
        component="button"
        type="submit"
        leftSection={<IconLogout2 size={16} />}
      >
        Sign Out
      </Menu.Item>
    </form>
  );
}
