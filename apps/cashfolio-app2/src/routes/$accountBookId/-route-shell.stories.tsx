import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text, Title } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { useRouterState } from "@tanstack/react-router";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AccountBookShell } from "./-account-book-shell";
import { DESKTOP_RAIL_COLLAPSED_STORAGE_KEY } from "./-route-helpers";

const STORYBOOK_ACCOUNT_BOOK_ID = "storybook-book";

function getHeadingLabel(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const section = segments[1];

  if (section === "activity") return "Transactions";
  if (section === "period") return "Report";
  if (section === "timeline") return "History";
  if (section === "valuation-cache") return "Valuation Cache";
  if (section === "settings") return "Settings";
  if (section === "accounts") return "Accounts";

  return "Accounts";
}

function AccountBookShellSmokeHarness() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const href = useRouterState({
    select: (state) => state.location.href,
  });
  const search = useRouterState({
    select: (state) => state.location.search,
  });
  const accountBookId =
    pathname.split("/").filter(Boolean)[0] ?? STORYBOOK_ACCOUNT_BOOK_ID;

  return (
    <>
      <Notifications />
      <AccountBookShell
        accountSecurityUrl="https://tenant.logto.app/account/security"
        accountBookId={accountBookId}
        currentHref={href}
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
        pathname={pathname}
        accountsLinkSearch={{ tab: "ASSET", mode: "active" }}
        periodLinkSearch={{}}
      >
        <Box px="xl" py="xl">
          <Title order={2}>{getHeadingLabel(pathname)}</Title>
          <Text data-testid="router-path">{pathname}</Text>
          <Text data-testid="router-search">{JSON.stringify(search)}</Text>
        </Box>
      </AccountBookShell>
    </>
  );
}

function resetDesktopRailPreference() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    window.localStorage.removeItem(DESKTOP_RAIL_COLLAPSED_STORAGE_KEY);
  } catch {
    // Ignore blocked storage in Storybook sandboxes.
  }

  return {};
}

function readDesktopRailPreference() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(DESKTOP_RAIL_COLLAPSED_STORAGE_KEY);
  } catch {
    return null;
  }
}

const meta = {
  title: "Routes/AccountBookShell",
  component: AccountBookShellSmokeHarness,
} satisfies Meta<typeof AccountBookShellSmokeHarness>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RouteSmoke: Story = {
  loaders: [resetDesktopRailPreference],
  render: () => <AccountBookShellSmokeHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("button", { name: "Collapse Sidebar" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("link", { name: "Transactions" }));
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/activity",
    );

    await userEvent.click(canvas.getByRole("link", { name: "Report" }));
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/period",
    );

    await userEvent.click(canvas.getByRole("link", { name: "History" }));
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/timeline",
    );

    await userEvent.click(
      canvas.getByRole("link", { name: "Valuation Cache" }),
    );
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/valuation-cache",
    );

    await userEvent.click(canvas.getByRole("link", { name: "Settings" }));
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/settings",
    );

    await userEvent.click(canvas.getByRole("link", { name: "Accounts" }));
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/accounts",
    );
    await expect(canvas.getByTestId("router-search")).toHaveTextContent(
      '"mode":"active"',
    );
    await expect(
      canvas.getByRole("link", { name: "Accounts" }),
    ).toHaveAttribute("data-active", "true");
    const adminLink = canvas.getByRole("link", { name: "Admin" });
    await expect(adminLink).toHaveAttribute("href", "/admin");
    await expect(adminLink).toHaveAttribute("target", "_blank");
    await expect(adminLink).toHaveAttribute("rel", "noopener noreferrer");
    await expect(
      canvas.getByRole("button", { name: "Storybook Book" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Storybook User" }),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Storybook Book" }),
    );
    await expect(
      canvas.queryByRole("menuitem", { name: "Account Book Settings" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("menuitem", { name: "Create New" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("menuitem", { name: "Create New" }),
    ).toHaveAttribute("href", expect.stringContaining("returnTo="));
    await expect(
      canvas.queryByRole("menuitem", { name: "Sign Out" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("menuitem", { name: "Create New" }),
    ).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(
      canvas.getByRole("menuitem", { name: "Storybook Alt Book" }),
    );
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-alt-book/accounts",
    );
    await expect(
      await within(document.body).findByText("Now viewing Storybook Alt Book."),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Storybook User" }),
    );
    await expect(
      canvas.getByRole("menuitem", { name: "User Settings" }),
    ).toBeVisible();
    const accountSecurityLink = canvas.getByRole("menuitem", {
      name: "Account Security",
    });
    await expect(accountSecurityLink).toBeVisible();
    await expect(accountSecurityLink).toHaveAttribute(
      "href",
      "https://tenant.logto.app/account/security",
    );
    await expect(accountSecurityLink).toHaveAttribute("target", "_blank");
    await expect(
      canvas.getByRole("menuitem", { name: "Sign Out" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("menuitem", { name: "User Settings" }),
    );
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/user-settings",
    );
    await expect(canvas.getByTestId("router-search")).toHaveTextContent(
      "returnTo",
    );
  },
};

export const DesktopRailSmoke: Story = {
  loaders: [resetDesktopRailPreference],
  render: () => <AccountBookShellSmokeHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse Sidebar" }),
    );

    await expect(
      canvas.getByRole("button", { name: "Expand Sidebar" }),
    ).toBeVisible();
    await waitFor(() => {
      expect(readDesktopRailPreference()).toBe("true");
    });
    await expect(canvas.queryByText("Report")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Valuation Cache")).not.toBeInTheDocument();

    const reportRailLink = canvas.getByRole("link", { name: "Report" });
    await expect(reportRailLink).toBeVisible();
    await userEvent.hover(reportRailLink);
    await expect(
      await within(document.body).findByText("Report"),
    ).toBeVisible();
    await userEvent.unhover(reportRailLink);

    const valuationCacheRailLink = canvas.getByRole("link", {
      name: "Valuation Cache",
    });
    await expect(valuationCacheRailLink).toBeVisible();
    await userEvent.hover(valuationCacheRailLink);
    await expect(
      await within(document.body).findByText("Valuation Cache"),
    ).toBeVisible();
    await userEvent.unhover(valuationCacheRailLink);

    await userEvent.click(valuationCacheRailLink);
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/valuation-cache",
    );

    await userEvent.click(canvas.getByRole("link", { name: "Settings" }));
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/settings",
    );

    await userEvent.click(canvas.getByRole("link", { name: "Transactions" }));
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/activity",
    );

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Switch account book, current: Storybook Book",
      }),
    );
    await expect(
      canvas.queryByRole("menuitem", { name: "Account Book Settings" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Open user menu, current: Storybook User",
      }),
    );
    await expect(
      canvas.getByRole("menuitem", { name: "Sign Out" }),
    ).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(
      canvas.getByRole("button", { name: "Expand Sidebar" }),
    );
    await waitFor(() => {
      expect(readDesktopRailPreference()).toBe("false");
    });
    await expect(
      canvas.getByRole("link", { name: "Valuation Cache" }),
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Settings" })).toBeVisible();
  },
};

export const MobileFooterControlsSmoke: Story = {
  loaders: [resetDesktopRailPreference],
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
  render: () => <AccountBookShellSmokeHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Toggle Navigation" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Storybook Book" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Storybook User" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Storybook User" }),
    );
    await expect(
      canvas.getByRole("menuitem", { name: "Sign Out" }),
    ).toBeVisible();
  },
};
