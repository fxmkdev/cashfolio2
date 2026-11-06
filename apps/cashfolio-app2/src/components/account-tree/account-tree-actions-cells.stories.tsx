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
  unarchivable?: boolean;
  unarchivePending?: boolean;
  onAddAccount?: () => void;
  onAddGroup?: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onUnarchive: () => void;
};

function StoryComponent({
  variant,
  archivable = true,
  deletable = true,
  unarchivable = true,
  onEdit,
  onArchive,
  onDelete,
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
          archivable={archivable}
          deletable={deletable}
          onEdit={onEdit}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      ) : (
        <ArchivedAccountTreeActionsCell
          rowLabel="Cash"
          unarchivePending={unarchivePending}
          deleteLabel={deletable ? "Delete" : "Cannot delete this row"}
          unarchiveLabel={unarchivable ? "Unarchive" : "Cannot unarchive"}
          deletable={deletable}
          onEdit={onEdit}
          onDelete={onDelete}
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
    unarchivable: true,
    onEdit: fn(),
    onArchive: fn(),
    onDelete: fn(),
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
    await expect(
      body.queryByRole("menuitem", { name: "Reorder Siblings" }),
    ).not.toBeInTheDocument();
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
  args: { archivable: false, deletable: false },
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const trigger = within(canvasElement).getByRole("button", {
      name: "More Actions for Cash",
    });
    await expect(trigger.getBoundingClientRect().width).toBe(22);
    await userEvent.click(trigger);
    const menu = await body.findByRole("menu");
    const deleteItem = body.getByRole("menuitem", { name: "Delete" });
    await expect(deleteItem).toHaveAttribute("aria-disabled", "true");
    await expect(deleteItem).toHaveTextContent(/^Delete$/);
    await expect(deleteItem).toHaveAccessibleDescription(
      "Cannot delete this row",
    );
    await expect(body.queryByRole("tooltip")).not.toBeInTheDocument();
    await userEvent.hover(deleteItem);
    await waitFor(() => {
      expect(body.getByRole("tooltip")).toBeVisible();
      expect(body.getByRole("tooltip")).toHaveTextContent(
        "Cannot delete this row",
      );
    });
    await userEvent.click(deleteItem);
    await expect(menu).toBeVisible();
    await expect(args.onDelete).not.toHaveBeenCalled();
    await userEvent.unhover(deleteItem);
    await waitFor(() =>
      expect(body.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
    await expect(deleteItem).toHaveAccessibleDescription(
      "Cannot delete this row",
    );
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(menu).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(body.getByRole("menu")).toBeVisible());
    await userEvent.keyboard("{ArrowDown}");
    await expect(body.getByRole("menuitem", { name: "Edit" })).toHaveFocus();
    await waitFor(() =>
      expect(body.queryByRole("tooltip")).not.toBeInTheDocument(),
    );
    await userEvent.keyboard("{ArrowDown}");
    const archive = body.getByRole("menuitem", { name: "Archive" });
    await expect(archive).toHaveFocus();
    await waitFor(() => {
      expect(body.getByRole("tooltip")).toBeVisible();
      expect(body.getByRole("tooltip")).toHaveTextContent(
        "Cannot archive this row",
      );
    });
    await userEvent.keyboard("{Enter} ");
    await expect(args.onArchive).not.toHaveBeenCalled();
    await expect(body.getByRole("menu")).toBeVisible();
    await userEvent.keyboard("{ArrowDown}");
    await expect(body.getByRole("menuitem", { name: "Delete" })).toHaveFocus();
    await waitFor(() =>
      expect(body.getByRole("tooltip")).toHaveTextContent(
        "Cannot delete this row",
      ),
    );
    await userEvent.keyboard("{Enter} ");
    await expect(args.onDelete).not.toHaveBeenCalled();
    await expect(body.getByRole("menu")).toBeVisible();
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
    ).toHaveAttribute("aria-disabled", "true");
    const unarchive = body.getByRole("menuitem", { name: "Unarchive" });
    await expect(unarchive).toHaveAccessibleDescription("Unarchiving…");
    await userEvent.hover(unarchive);
    await waitFor(() =>
      expect(body.getByRole("tooltip")).toHaveTextContent("Unarchiving…"),
    );
  },
};
