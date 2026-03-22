import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mantine/core";
import { expect, fn, userEvent, within } from "storybook/test";
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
}: StoryProps) {
  return (
    <Box w={240}>
      {variant === "active" ? (
        <ActiveAccountTreeActionsCell
          archiveLabel={archivable ? "Archive" : "Cannot archive this row"}
          deleteLabel={deletable ? "Delete" : "Cannot delete this row"}
          reorderLabel="Reorder siblings"
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
          unarchiveLabel={unarchivable ? "Unarchive" : "Cannot unarchive"}
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

    await userEvent.click(canvas.getByRole("button", { name: "Edit" }));
    await userEvent.click(canvas.getByRole("button", { name: "Archive" }));
    await userEvent.click(canvas.getByRole("button", { name: "Delete" }));

    await expect(args.onEdit).toHaveBeenCalled();
    await expect(args.onArchive).toHaveBeenCalled();
    await expect(args.onDelete).toHaveBeenCalled();
  },
};
