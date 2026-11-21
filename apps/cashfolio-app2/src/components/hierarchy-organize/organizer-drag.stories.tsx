import { Box } from "@mantine/core";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { createOrganizerStoryApi } from "./story-fixtures";
import {
  organizerStoryMeta,
  Harness,
  row,
  select,
  type OrganizerStory as Story,
} from "./story-harness";
const meta = {
  ...organizerStoryMeta,
  title: "Screens/Accounts/Organize/Hierarchy",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  component: Harness,
};
export default meta;

export const DragIntoGroupView: Story = {
  name: "Drag Into Group Playground",
  tags: ["!regression"],
  play: undefined,
};

export const DragIntoGroup: Story = {
  ...DragIntoGroupView,
  name: "Drag Into Group Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const source = await row(canvasElement, "checking");
    const target = await row(canvasElement, "destination");
    const handle = source.querySelector<HTMLElement>(".ag-row-drag")!;
    await expect(handle).not.toBeNull();
    const from = handle.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    await userEvent.hover(handle);
    await userEvent.pointer([
      {
        target: handle,
        coords: {
          clientX: from.x + from.width / 2,
          clientY: from.y + from.height / 2,
        },
        keys: "[MouseLeft>]",
      },
      {
        target,
        coords: { clientX: to.x + 180, clientY: to.y + to.height / 2 },
      },
      {
        target,
        coords: { clientX: to.x + 182, clientY: to.y + to.height / 2 },
      },
      {
        target,
        coords: { clientX: to.x + 182, clientY: to.y + to.height / 2 },
        keys: "[/MouseLeft]",
      },
    ]);
    await waitFor(async () =>
      expect(await row(canvasElement, "checking")).toHaveClass(
        "ag-row-level-1",
      ),
    );
  },
};

export const DragReorderAndCancel: Story = {
  ...DragIntoGroupView,
  name: "Drag Reorder And Cancel Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const source = await row(canvasElement, "checking");
    const target = await row(canvasElement, "investments");
    const handle = source.querySelector<HTMLElement>(".ag-row-drag")!;
    const from = handle.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const user = userEvent.setup();
    await user.pointer([
      {
        target: handle,
        coords: { clientX: from.x + 5, clientY: from.y + 5 },
        keys: "[MouseLeft>]",
      },
      { target, coords: { clientX: to.x + 180, clientY: to.y + 3 } },
      { target, coords: { clientX: to.x + 182, clientY: to.y + 3 } },
    ]);
    await expect(
      within(canvasElement).getByText(/Move 1 item before Investments/),
    ).toBeVisible();
    await user.keyboard("{Escape}");
    await user.pointer({ target, keys: "[/MouseLeft]" });
    await expect(source).toHaveAttribute("row-index", "4");

    await user.pointer([
      {
        target: handle,
        coords: { clientX: from.x + 5, clientY: from.y + 5 },
        keys: "[MouseLeft>]",
      },
      { target, coords: { clientX: to.x + 180, clientY: to.y + 3 } },
      { target, coords: { clientX: to.x + 182, clientY: to.y + 3 } },
      {
        target,
        coords: { clientX: to.x + 182, clientY: to.y + 3 },
        keys: "[/MouseLeft]",
      },
    ]);
    await waitFor(async () =>
      expect(await row(canvasElement, "checking")).toHaveAttribute(
        "row-index",
        "0",
      ),
    );
  },
};

export const DragSelectedSubtreeAndMoveToTopLevel: Story = {
  ...DragIntoGroupView,
  name: "Drag Selected Subtree And Move To Top Level Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    await select(canvasElement, "investments");
    await select(canvasElement, "nested");
    await select(canvasElement, "checking");
    const source = await row(canvasElement, "investments");
    const target = await row(canvasElement, "destination");
    const handle = source.querySelector<HTMLElement>(".ag-row-drag")!;
    const from = handle.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    await userEvent.pointer([
      {
        target: handle,
        coords: { clientX: from.x + 5, clientY: from.y + 5 },
        keys: "[MouseLeft>]",
      },
      {
        target,
        coords: { clientX: to.x + 180, clientY: to.y + to.height / 2 },
      },
      {
        target,
        coords: { clientX: to.x + 182, clientY: to.y + to.height / 2 },
      },
      {
        target,
        coords: { clientX: to.x + 182, clientY: to.y + to.height / 2 },
        keys: "[/MouseLeft]",
      },
    ]);
    await waitFor(async () =>
      expect(await row(canvasElement, "investments")).toHaveClass(
        "ag-row-level-1",
      ),
    );
    await expect(await row(canvasElement, "checking")).toHaveClass(
      "ag-row-level-1",
    );
    await expect(await row(canvasElement, "nested")).toHaveClass(
      "ag-row-level-2",
    );
    const canvas = within(canvasElement);
    await userEvent.click(
      within(
        canvas.getByRole("toolbar", { name: "Organize Account Actions" }),
      ).getByRole("button", {
        name: "Move To…",
      }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Move To…",
      }),
    );
    await expect(dialog.getByLabelText("Destination")).toHaveValue("Top Level");
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await waitFor(async () =>
      expect(await row(canvasElement, "investments")).toHaveClass(
        "ag-row-level-0",
      ),
    );
    await expect(await row(canvasElement, "checking")).toHaveClass(
      "ag-row-level-0",
    );
    await expect(await row(canvasElement, "nested")).toHaveClass(
      "ag-row-level-1",
    );
  },
};

export const NarrowDragFeedbackKeepsRowsStationaryView: Story = {
  args: { api: createOrganizerStoryApi() },
  render: (args) => (
    <Box w={650}>
      <Harness {...args} useProvidedApi />
    </Box>
  ),
  name: "Narrow Drag Feedback Keeps Rows Stationary Playground",
  tags: ["!regression"],
  play: undefined,
};

export const NarrowDragFeedbackKeepsRowsStationary: Story = {
  ...NarrowDragFeedbackKeepsRowsStationaryView,
  name: "Narrow Drag Feedback Keeps Rows Stationary Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await select(canvasElement, "checking");
    await select(canvasElement, "empty");
    const source = await row(canvasElement, "checking");
    const target = await row(canvasElement, "cash");
    const handle = source.querySelector<HTMLElement>(".ag-row-drag")!;
    const top = canvas.getByRole("treegrid").getBoundingClientRect().top;
    const bounds = handle.getBoundingClientRect();
    const destination = target.getBoundingClientRect();
    const original = args.api.move;
    const move = fn(original);
    args.api.move = move;
    const user = userEvent.setup();
    try {
      await user.pointer([
        {
          target: handle,
          coords: { clientX: bounds.x + 5, clientY: bounds.y + 5 },
          keys: "[MouseLeft>]",
        },
        {
          target,
          coords: {
            clientX: destination.x + 180,
            clientY: destination.y + destination.height / 2,
          },
        },
        {
          target,
          coords: {
            clientX: destination.x + 182,
            clientY: destination.y + destination.height / 2,
          },
        },
      ]);
      await expect(canvas.getByText(/Move 2 items into Cash/)).toBeVisible();
      await expect(
        canvas.getByRole("treegrid").getBoundingClientRect().top,
      ).toBeCloseTo(top, 0);
      await user.keyboard("{Escape}");
      await user.pointer({ target, keys: "[/MouseLeft]" });
      await expect(move).not.toHaveBeenCalled();
    } finally {
      args.api.move = original;
    }
  },
};
