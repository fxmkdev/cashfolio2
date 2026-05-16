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

    await expect(
      canvas.getByRole("link", { name: "Overview" }),
    ).toHaveAttribute("href", "/admin");
    const appLink = canvas.getByRole("link", { name: "Go to App" });
    await expect(appLink).toHaveAttribute("href", "/");
    await expect(appLink).toHaveAttribute("target", "_blank");
    await expect(appLink).toHaveAttribute("rel", "noopener noreferrer");
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
