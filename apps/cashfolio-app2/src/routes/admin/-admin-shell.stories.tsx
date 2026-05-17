import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Text, Title } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { useRouterState } from "@tanstack/react-router";
import { expect, userEvent, within } from "storybook/test";
import { AdminShell } from "./-admin-shell";

function AdminShellSmokeHarness() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const search = useRouterState({
    select: (state) => state.location.search,
  });

  return (
    <>
      <Notifications />
      <AdminShell
        accountSecurityUrl="https://tenant.logto.app/account/security"
        appVersion="storybook"
        userProfile={{
          displayName: "Storybook User",
          avatarUrl: null,
          initials: "SU",
        }}
      >
        <Box px="xl" py="xl">
          <Title order={2}>Admin</Title>
          <Text>Coming soon</Text>
          <Text data-testid="router-path">{pathname}</Text>
          <Text data-testid="router-search">{JSON.stringify(search)}</Text>
        </Box>
      </AdminShell>
    </>
  );
}

const meta = {
  title: "Routes/AdminShell",
  component: AdminShellSmokeHarness,
} satisfies Meta<typeof AdminShellSmokeHarness>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RouteSmoke: Story = {
  render: () => <AdminShellSmokeHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const overviewLink = canvas.getByRole("link", { name: "Overview" });
    await expect(overviewLink).toHaveAttribute("href", "/admin");
    await userEvent.click(overviewLink);
    await expect(canvas.getByTestId("router-path")).toHaveTextContent("/admin");
    const valuationCacheLink = canvas.getByRole("link", {
      name: "Valuation Cache",
    });
    await expect(valuationCacheLink).toHaveAttribute(
      "href",
      "/admin/valuation-cache",
    );
    await userEvent.click(valuationCacheLink);
    await expect(canvas.getByTestId("router-path")).toHaveTextContent(
      "/admin/valuation-cache",
    );
    await expect(overviewLink).not.toHaveAttribute("data-active", "true");
    await expect(valuationCacheLink).toHaveAttribute("data-active", "true");
    await expect(canvas.getByRole("link", { name: "Users" })).toHaveAttribute(
      "href",
      "/admin/users",
    );
    const appLink = canvas.getByRole("link", { name: "Back to App" });
    await expect(appLink).toHaveAttribute("href", "/");
    await expect(appLink).not.toHaveAttribute("target");
    await expect(appLink).not.toHaveAttribute("rel");
    await userEvent.click(appLink);
    await expect(canvas.getByTestId("router-path")).toHaveTextContent("/");
    await userEvent.click(
      canvas.getByRole("button", { name: "Storybook User" }),
    );
    await expect(
      canvas.getByRole("menuitem", { name: "User Settings" }),
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
