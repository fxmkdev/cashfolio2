import { Notifications } from "@mantine/notifications";
import { useRouterState } from "@tanstack/react-router";
import {
  AccountBookShell,
  type AccountBookShellProps,
} from "./-account-book-shell";

/** Fixture-backed real shell for frontend-only screen previews. */
export function AccountBookStoryShell({
  children,
  activeSection,
}: Pick<AccountBookShellProps, "children" | "activeSection">) {
  const location = useRouterState({ select: (state) => state.location });
  const accountBookId =
    location.pathname.split("/").filter(Boolean)[0] ?? "storybook-book";
  return (
    <>
      <Notifications />
      <AccountBookShell
        userSecurityUrl="https://tenant.logto.app/account/security"
        accountBookId={accountBookId}
        canAccessAdmin
        currentHref={location.href}
        accountBooks={[
          { id: "storybook-book", name: "Storybook Book" },
          { id: "storybook-alt-book", name: "Storybook Alt Book" },
        ]}
        appVersion="storybook"
        userProfile={{
          displayName: "Storybook User",
          avatarUrl: null,
          initials: "SU",
        }}
        pathname={location.pathname}
        activeSection={activeSection}
        accountsLinkSearch={{ tab: "BALANCE", mode: "active" }}
        periodLinkSearch={{}}
      >
        {children}
      </AccountBookShell>
    </>
  );
}
