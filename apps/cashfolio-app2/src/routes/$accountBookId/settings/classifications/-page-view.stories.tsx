import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ClassificationsPageView } from "./-page-view";
const meta = {
  title: "Routes/Settings/Classifications",
  component: ClassificationsPageView,
  args: {
    nodes: [
      {
        id: "equities",
        name: "Equities",
        parentId: null,
        sortOrder: 0,
        activeCount: 1,
        archivedCount: 0,
      },
      {
        id: "swiss",
        name: "Swiss Equities",
        parentId: "equities",
        sortOrder: 0,
        activeCount: 2,
        archivedCount: 1,
      },
      {
        id: "cash",
        name: "Cash",
        parentId: null,
        sortOrder: 1,
        activeCount: 0,
        archivedCount: 0,
      },
    ],
    onSave: fn(async () => {}),
    onDelete: fn(async () => {}),
    onMove: fn(async () => {}),
    onRefresh: fn(async () => {}),
  },
} satisfies Meta<typeof ClassificationsPageView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Hierarchy: Story = {};
export const CreateChild: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Child to Equities" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "New Asset Class" }),
    );
    await expect(dialog.getByLabelText("Parent Class")).toHaveValue("Equities");
    await userEvent.type(dialog.getByLabelText("Name"), "International");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith({
        id: undefined,
        name: "International",
        parentId: "equities",
      }),
    );
  },
};
export const DeleteAssignedLeaf: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.getByRole("button", { name: "Delete Equities" }),
    ).toBeDisabled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Delete Swiss Equities" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Delete Asset Class" }),
    );
    await expect(dialog.getByText(/2 active and 1 archived/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Delete" })).toBeDisabled();
    await userEvent.click(dialog.getByLabelText("Replacement Asset Class"));
    await userEvent.click(body.getByRole("option", { name: "Unclassified" }));
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(args.onDelete).toHaveBeenCalledWith("swiss", null),
    );
  },
};
export const SaveFailurePreservesDraft: Story = {
  play: async ({ canvasElement, args }) => {
    args.onSave.mockRejectedValueOnce(
      new Error("The selected parent is no longer available."),
    );
    const canvas = within(canvasElement),
      body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "New Asset Class" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "New Asset Class" }),
    );
    await userEvent.type(dialog.getByLabelText("Name"), "My Class");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "no longer available",
    );
    await expect(dialog.getByLabelText("Name")).toHaveValue("My Class");
    await expect(args.onRefresh).toHaveBeenCalled();
  },
};
