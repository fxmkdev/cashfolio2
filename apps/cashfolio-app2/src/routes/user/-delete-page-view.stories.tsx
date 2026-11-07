import type { Meta, StoryObj } from "@storybook/react-vite";
import { Text } from "@mantine/core";
import { useRouterState } from "@tanstack/react-router";
import { expect, userEvent, within } from "storybook/test";
import { UserDeletePageView } from "./-delete-page-view";

const preview = {
  displayName: "Ada",
  accountBooksToDelete: [{ id: "private", name: "Private Book" }],
  accountBooksToUnlink: [{ id: "shared", name: "Shared Book" }],
};

function UserDeleteRouteSmoke() {
  const location = useRouterState({ select: (state) => state.location });
  const deleted =
    new URLSearchParams(location.searchStr).get("deleted") === "1";
  return (
    <>
      <UserDeletePageView
        deleted={deleted}
        preview={deleted ? null : preview}
      />
      <Text data-testid="router-href">{location.href}</Text>
    </>
  );
}

const meta = {
  title: "Routes/UserDeletePageView",
  component: UserDeletePageView,
  parameters: { router: { initialPath: "/user/delete" } },
  args: { deleted: false, preview },
  decorators: [
    (Story) => (
      <div onSubmit={(event) => event.preventDefault()}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UserDeletePageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MixedBooks: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Private Book")).toBeVisible();
    await expect(canvas.getByText("Shared Book")).toBeVisible();
    const button = canvas.getByRole("button", {
      name: "Delete My Cashfolio Account",
    });
    await expect(button.closest("form")).toHaveAttribute(
      "action",
      "/user/delete",
    );
    await expect(button.closest("form")).toHaveAttribute("method", "post");
    await userEvent.click(button);
    await expect(
      canvas.getByRole("heading", { name: "Delete Your Cashfolio Account" }),
    ).toBeVisible();
  },
};

export const OnlyPrivateBooks: Story = {
  args: { preview: { ...preview, accountBooksToUnlink: [] } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("No shared account books will be kept."),
    ).toBeVisible();
  },
};

export const OnlySharedBooks: Story = {
  args: { preview: { ...preview, accountBooksToDelete: [] } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("No account books will be deleted."),
    ).toBeVisible();
  },
};

export const NoBooks: Story = {
  args: {
    preview: { ...preview, accountBooksToDelete: [], accountBooksToUnlink: [] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("No account books will be deleted."),
    ).toBeVisible();
    await expect(
      canvas.getByText("No shared account books will be kept."),
    ).toBeVisible();
  },
};

export const Deleted: Story = {
  args: { deleted: true, preview: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Cashfolio account deleted" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
  },
};

export const RouteSmoke: Story = {
  parameters: { router: { initialPath: "/user/delete?deleted=1" } },
  render: () => <UserDeleteRouteSmoke />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("router-href")).toHaveTextContent(
      "/user/delete?deleted=1",
    );
    await expect(
      canvas.getByRole("heading", { name: "Cashfolio account deleted" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
  },
};
