import type { Meta, StoryObj } from "@storybook/react-vite";
import { Notifications } from "@mantine/notifications";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { UserRole } from "@/.prisma-client/enums";
import type { AdminUserListItem } from "@/server/admin-users";
import { AdminUsersPageView } from "./-users-page-view";

const users: AdminUserListItem[] = [
  {
    id: "actor",
    externalId: "actor",
    displayName: "Current Admin",
    email: "admin@example.test",
    username: null,
    avatarUrl: null,
    identityStatus: "available",
    roles: [UserRole.ADMIN],
    deletionPending: false,
    accountBookCount: 1,
    isCurrentUser: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "target",
    externalId: "pending-user",
    displayName: "Pending user",
    email: null,
    username: null,
    avatarUrl: null,
    identityStatus: "missing",
    roles: [UserRole.ADMIN],
    deletionPending: true,
    accountBookCount: 2,
    isCurrentUser: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
];
const meta = {
  title: "Routes/AdminUsers",
  component: AdminUsersPageView,
  args: { users, onSubmitRoles: fn(), onDeleteUser: fn(async () => {}) },
  render: (args) => (
    <>
      <Notifications />
      <div style={{ height: 600 }}>
        <AdminUsersPageView {...args} />
      </div>
    </>
  ),
} satisfies Meta<typeof AdminUsersPageView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PendingDeletion: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByText("Deletion pending")).toBeVisible();
    await expect(canvas.getByText("Admin (inactive)")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "More Actions for Pending user" }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "Manage Roles" }),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.hover(body.getByRole("menuitem", { name: "Manage Roles" }));
    await waitFor(() =>
      expect(body.getByRole("tooltip")).toHaveTextContent(
        "Deletion pending; role changes unavailable",
      ),
    );
    await userEvent.click(
      body.getByRole("menuitem", { name: "Retry Deletion" }),
    );
    const dialog = await body.findByRole("dialog", { name: "Retry Deletion" });
    const controls = within(dialog);
    await waitFor(() =>
      expect(controls.getByText(/Deletion has started/)).toBeVisible(),
    );
    const submit = controls.getByRole("button", { name: "Retry Deletion" });
    await expect(submit).toBeDisabled();
    await userEvent.type(
      controls.getByRole("textbox", { name: "External ID" }),
      "pending-user",
    );
    await userEvent.click(submit);
    await expect(args.onDeleteUser).toHaveBeenCalledWith({
      userId: "target",
      confirmation: "pending-user",
    });
  },
};
export const DeletionFailure: Story = {
  args: {
    onDeleteUser: fn(async () => {
      throw new Error("Deletion is pending. Retry to finish it.");
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "More Actions for Pending user",
      }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Retry Deletion" }),
    );
    const controls = within(
      await body.findByRole("dialog", { name: "Retry Deletion" }),
    );
    await userEvent.type(
      controls.getByRole("textbox", { name: "External ID" }),
      "pending-user",
    );
    await userEvent.click(
      controls.getByRole("button", { name: "Retry Deletion" }),
    );
    await expect(
      await controls.findByText("Deletion is pending. Retry to finish it."),
    ).toBeVisible();
    await expect(
      controls.getByRole("button", { name: "Retry Deletion" }),
    ).toBeEnabled();
  },
};

export const SelfDeletionDisabled: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await within(canvasElement).findByRole("button", {
        name: "More Actions for Current Admin",
      }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "Delete" }),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.hover(body.getByRole("menuitem", { name: "Delete" }));
    await waitFor(() =>
      expect(body.getByRole("tooltip")).toHaveTextContent(
        "You cannot delete yourself",
      ),
    );
    await userEvent.click(body.getByRole("menuitem", { name: "Manage Roles" }));
    const dialog = await body.findByRole("dialog");
    await waitFor(() =>
      expect(body.queryByRole("menu")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
  },
};
