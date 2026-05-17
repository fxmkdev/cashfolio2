import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text, Title } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { useRouterState } from "@tanstack/react-router";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { findVisibleMenuItem } from "@/storybook-test-utils";
import { AccountBookShell } from "./-account-book-shell";
import { DESKTOP_RAIL_COLLAPSED_STORAGE_KEY } from "./-route-helpers";

const STORYBOOK_ACCOUNT_BOOK_ID = "storybook-book";

function getHeadingLabel(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const section = segments[1];

  if (section === "transactions") return "Transactions";
  if (section === "report") return "Report";
  if (section === "history") return "History";
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
        canAccessAdmin
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

async function findUserMenuButton(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  return await canvas.findByRole("button", {
    name: /Storybook User/,
  });
}

const meta = {
  title: "Routes/AccountBookShell",
  component: AccountBookShellSmokeHarness,
} satisfies Meta<typeof AccountBookShellSmokeHarness>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RouteSmoke: Story = {
  parameters: {
    router: {
      initialPath: "/storybook-book/accounts?tab=ASSET&mode=active",
    },
  },
  loaders: [resetDesktopRailPreference],
  render: () => <AccountBookShellSmokeHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await expect(
      await canvas.findByRole("button", { name: "Collapse Sidebar" }),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("link", { name: "Transactions" }));
    await waitFor(() => {
      expect(canvas.getByTestId("router-path")).toHaveTextContent(
        "/storybook-book/transactions",
      );
    });

    await userEvent.click(canvas.getByRole("link", { name: "Report" }));
    await waitFor(() => {
      expect(canvas.getByTestId("router-path")).toHaveTextContent(
        "/storybook-book/report",
      );
    });

    await userEvent.click(canvas.getByRole("link", { name: "History" }));
    await waitFor(() => {
      expect(canvas.getByTestId("router-path")).toHaveTextContent(
        "/storybook-book/history",
      );
    });

    await expect(
      canvas.queryByRole("link", { name: "Valuation Cache" }),
    ).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("link", { name: "Settings" }));
    await waitFor(() => {
      expect(canvas.getByTestId("router-path")).toHaveTextContent(
        "/storybook-book/settings",
      );
    });

    await userEvent.click(canvas.getByRole("link", { name: "Accounts" }));
    await waitFor(() => {
      expect(canvas.getByTestId("router-path")).toHaveTextContent(
        "/storybook-book/accounts",
      );
    });
    await expect(canvas.getByTestId("router-search")).toHaveTextContent(
      '"mode":"active"',
    );
    await expect(
      canvas.getByRole("link", { name: "Accounts" }),
    ).toHaveAttribute("data-active", "true");

    const adminLink = canvas.getByRole("link", { name: "Admin" });
    await expect(adminLink).toHaveAttribute("href", "/admin");
    await expect(adminLink).not.toHaveAttribute("target");
    await expect(adminLink).not.toHaveAttribute("rel");
    await expect(
      canvas.getByRole("button", { name: "Storybook Book" }),
    ).toBeInTheDocument();
    await expect(await findUserMenuButton(canvasElement)).toBeInTheDocument();

    await userEvent.click(await findUserMenuButton(canvasElement));
    const userSettingsMenuItem = await findVisibleMenuItem(
      body,
      "User Settings",
    );
    const accountSecurityLink = await findVisibleMenuItem(
      body,
      "Account Security",
    );
    await expect(accountSecurityLink).toHaveAttribute(
      "href",
      "https://tenant.logto.app/account/security",
    );
    await expect(accountSecurityLink).toHaveAttribute("target", "_blank");
    await expect(await findVisibleMenuItem(body, "Sign Out")).toBeVisible();
    await expect(userSettingsMenuItem).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        body.queryByRole("menuitem", { name: "User Settings" }),
      ).not.toBeInTheDocument();
    });

    await userEvent.click(
      canvas.getByRole("button", { name: "Storybook Book" }),
    );
    await expect(
      body.queryByRole("menuitem", { name: "Account Book Settings" }),
    ).not.toBeInTheDocument();
    await expect(await findVisibleMenuItem(body, "Create New")).toBeVisible();
    await expect(await findVisibleMenuItem(body, "Create New")).toHaveAttribute(
      "href",
      expect.stringContaining("returnTo="),
    );
    await expect(
      body.queryByRole("menuitem", { name: "Sign Out" }),
    ).not.toBeInTheDocument();
    await expect(
      await findVisibleMenuItem(body, "Create New"),
    ).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(
      await findVisibleMenuItem(body, "Storybook Alt Book"),
    );
    await waitFor(() => {
      expect(canvas.getByTestId("router-path")).toHaveTextContent(
        "/storybook-alt-book/accounts",
      );
    });
    await expect(
      await body.findByText("Now viewing Storybook Alt Book."),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("link", { name: "Admin" }));
    await waitFor(() => {
      expect(canvas.getByTestId("router-path")).toHaveTextContent("/admin");
    });

    await userEvent.click(await findUserMenuButton(canvasElement));
    await userEvent.click(await findVisibleMenuItem(body, "User Settings"));
    await waitFor(() => {
      expect(canvas.getByTestId("router-path")).toHaveTextContent(
        "/user-settings",
      );
    });
    await expect(canvas.getByTestId("router-search")).toHaveTextContent(
      "returnTo",
    );
  },
};

export const DesktopRailSmoke: Story = {
  parameters: {
    router: {
      initialPath: "/storybook-book/accounts?tab=ASSET&mode=active",
    },
  },
  loaders: [resetDesktopRailPreference],
  render: () => <AccountBookShellSmokeHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      await canvas.findByRole("button", { name: "Collapse Sidebar" }),
    );

    await expect(
      await canvas.findByRole("button", { name: "Expand Sidebar" }),
    ).toBeVisible();
    await waitFor(() => {
      expect(readDesktopRailPreference()).toBe("true");
    });
    await expect(canvas.queryByText("Valuation Cache")).not.toBeInTheDocument();

    const reportRailLink = canvas.getByRole("link", { name: "Report" });
    await expect(reportRailLink).toBeVisible();
    await userEvent.hover(reportRailLink);
    await expect(await body.findByRole("tooltip")).toHaveTextContent("Report");
    await userEvent.unhover(reportRailLink);

    await expect(
      canvas.queryByRole("link", { name: "Valuation Cache" }),
    ).not.toBeInTheDocument();

    await userEvent.click(canvas.getByRole("link", { name: "Settings" }));
    await waitFor(() => {
      expect(canvas.getByTestId("router-path")).toHaveTextContent(
        "/storybook-book/settings",
      );
    });

    await userEvent.click(canvas.getByRole("link", { name: "Transactions" }));
    await waitFor(() => {
      expect(canvas.getByTestId("router-path")).toHaveTextContent(
        "/storybook-book/transactions",
      );
    });

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Switch account book, current: Storybook Book",
      }),
    );
    await expect(
      body.queryByRole("menuitem", { name: "Account Book Settings" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Open user menu, current: Storybook User",
      }),
    );
    await expect(await findVisibleMenuItem(body, "Sign Out")).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(
      canvas.getByRole("button", { name: "Expand Sidebar" }),
    );
    await waitFor(() => {
      expect(readDesktopRailPreference()).toBe("false");
    });
    await expect(
      canvas.queryByRole("link", { name: "Valuation Cache" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Settings" })).toBeVisible();
  },
};

export const MobileFooterControlsSmoke: Story = {
  loaders: [resetDesktopRailPreference],
  parameters: {
    router: {
      initialPath: "/storybook-book/accounts?tab=ASSET&mode=active",
    },
    testRunner: {
      viewport: { width: 390, height: 844 },
    },
    viewport: {
      defaultViewport: "mobile1",
    },
  },
  render: () => <AccountBookShellSmokeHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      await canvas.findByRole("button", { name: "Toggle Navigation" }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Storybook Book" }),
    ).toBeVisible();
    await expect(await findUserMenuButton(canvasElement)).toBeVisible();
    await userEvent.click(await findUserMenuButton(canvasElement));
    await expect(await findVisibleMenuItem(body, "Sign Out")).toBeVisible();
  },
};
