import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text, Title } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { useRouterState } from "@tanstack/react-router";
import { expect, userEvent, within } from "storybook/test";
import { AccountBookShell } from "./route";

const STORYBOOK_ACCOUNT_BOOK_ID = "storybook-book";

function getHeadingLabel(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const section = segments[1];

  if (section === "period") return "Period";
  if (section === "timeline") return "Timeline";
  if (section === "valuation-cache") return "Valuation Cache";
  if (section === "account-book-settings") return "Account Book Settings";
  if (section === "user-settings") return "User Settings";
  if (section === "accounts") return "Accounts";

  return "Accounts";
}

function AccountBookShellSmokeHarness() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
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
        accountBookId={accountBookId}
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

const meta = {
  title: "Routes/AccountBookShell",
  component: AccountBookShellSmokeHarness,
} satisfies Meta<typeof AccountBookShellSmokeHarness>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RouteSmoke: Story = {
  render: () => <AccountBookShellSmokeHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole("link", { name: "Period" }));
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/period",
    );

    await userEvent.click(canvas.getByRole("link", { name: "Timeline" }));
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/timeline",
    );

    await userEvent.click(
      canvas.getByRole("link", { name: "Valuation Cache" }),
    );
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-book/valuation-cache",
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
      canvas.getByRole("menuitem", { name: "Account Book Settings" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("menuitem", { name: "Create New" }),
    ).toBeVisible();
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
    await expect(
      canvas.getByRole("menuitem", { name: "Sign Out" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("menuitem", { name: "User Settings" }),
    );
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/storybook-alt-book/user-settings",
    );
  },
};

export const MobileFooterControlsSmoke: Story = {
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
