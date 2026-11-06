import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import {
  ActiveAccountTreeActionsCell,
  ArchivedAccountTreeActionsCell,
} from "./account-tree-actions-cells";

type StoryProps = {
  variant: "active" | "archived";
  archivable?: boolean;
  deletable?: boolean;
  reorderEnabled?: boolean;
  unarchivable?: boolean;
  unarchivePending?: boolean;
  onAddAccount?: () => void;
  onAddGroup?: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onReorder: () => void;
  onUnarchive: () => void;
};

function StoryComponent({
  variant,
  archivable = true,
  deletable = true,
  reorderEnabled = true,
  unarchivable = true,
  onEdit,
  onArchive,
  onDelete,
  onReorder,
  onUnarchive,
  unarchivePending,
  onAddAccount,
  onAddGroup,
}: StoryProps) {
  return (
    <Box w={240}>
      {variant === "active" ? (
        <ActiveAccountTreeActionsCell
          rowLabel="Cash"
          onAddAccount={onAddAccount}
          onAddGroup={onAddGroup}
          archiveLabel={archivable ? "Archive" : "Cannot archive this row"}
          deleteLabel={deletable ? "Delete" : "Cannot delete this row"}
          reorderLabel="Reorder Siblings"
          archivable={archivable}
          deletable={deletable}
          reorderEnabled={reorderEnabled}
          onEdit={onEdit}
          onArchive={onArchive}
          onDelete={onDelete}
          onReorder={onReorder}
        />
      ) : (
        <ArchivedAccountTreeActionsCell
          rowLabel="Cash"
          unarchivePending={unarchivePending}
          reorderLabel="Reorder Siblings"
          reorderEnabled={reorderEnabled}
          deleteLabel={deletable ? "Delete" : "Cannot delete this row"}
          unarchiveLabel={unarchivable ? "Unarchive" : "Cannot unarchive"}
          deletable={deletable}
          onEdit={onEdit}
          onDelete={onDelete}
          onReorder={onReorder}
          unarchivable={unarchivable}
          onUnarchive={onUnarchive}
        />
      )}
    </Box>
  );
}

const meta = {
  title: "Components/AccountTreeActionsCells",
  component: StoryComponent,
  args: {
    variant: "active",
    archivable: true,
    deletable: true,
    reorderEnabled: true,
    unarchivable: true,
    onEdit: fn(),
    onArchive: fn(),
    onDelete: fn(),
    onReorder: fn(),
    onUnarchive: fn(),
  },
} satisfies Meta<typeof StoryComponent>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Active: Story = {};

export const ActiveDisabled: Story = {
  args: {
    archivable: false,
    deletable: false,
    reorderEnabled: false,
  },
};

export const Archived: Story = {
  args: {
    variant: "archived",
  },
};

export const InteractionSmoke: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      canvas.getByRole("button", { name: "More Actions for Cash" }),
    );
    await userEvent.click(await body.findByRole("menuitem", { name: "Edit" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "More Actions for Cash" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Archive" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "More Actions for Cash" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );

    await expect(args.onEdit).toHaveBeenCalled();
    await expect(args.onArchive).toHaveBeenCalled();
    await expect(args.onDelete).toHaveBeenCalled();
  },
};

export const ArchivedInteractionSmoke: Story = {
  args: {
    variant: "archived",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      canvas.getByRole("button", { name: "More Actions for Cash" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Reorder Siblings" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "More Actions for Cash" }),
    );
    await userEvent.click(await body.findByRole("menuitem", { name: "Edit" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "More Actions for Cash" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "More Actions for Cash" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Unarchive" }),
    );

    await expect(args.onReorder).toHaveBeenCalled();
    await expect(args.onEdit).toHaveBeenCalled();
    await expect(args.onDelete).toHaveBeenCalled();
    await expect(args.onUnarchive).toHaveBeenCalled();
  },
};

export const ChildCreation: Story = {
  args: { onAddAccount: fn(), onAddGroup: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    for (const name of ["Add Account", "Add Group"]) {
      await userEvent.click(
        canvas.getByRole("button", { name: "More Actions for Cash" }),
      );
      await userEvent.click(await body.findByRole("menuitem", { name }));
    }
    await expect(args.onAddAccount).toHaveBeenCalledOnce();
    await expect(args.onAddGroup).toHaveBeenCalledOnce();
  },
};

export const DisabledExplanations: Story = {
  args: { archivable: false, deletable: false, reorderEnabled: false },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "More Actions for Cash",
      }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "Delete" }),
    ).toBeDisabled();
    await waitFor(() =>
      expect(body.getByText("Cannot delete this row")).toBeVisible(),
    );
    await waitFor(() =>
      expect(body.getByText("Cannot archive this row")).toBeVisible(),
    );
    await expect(args.onDelete).not.toHaveBeenCalled();
  },
};

export const UnarchivePending: Story = {
  args: { variant: "archived", unarchivePending: true },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "More Actions for Cash",
      }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "Unarchive" }),
    ).toBeDisabled();
    await waitFor(() => expect(body.getByText("Unarchiving…")).toBeVisible());
  },
};
