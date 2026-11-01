import { useState } from "react";
import { Box } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AccountOrganizer } from "./organizer";
import { createOrganizerStoryApi } from "./story-fixtures";

function Harness({
  failure,
  ...props
}: React.ComponentProps<typeof AccountOrganizer> & {
  failure?: "busy" | "network" | "load";
}) {
  const [api] = useState(() => createOrganizerStoryApi(failure));
  return (
    <Box h={650} style={{ display: "flex" }}>
      <AccountOrganizer {...props} api={api} />
    </Box>
  );
}

const meta = {
  title: "Routes/Accounts/Organize",
  component: AccountOrganizer,
  args: {
    accountBookId: "story-book",
    onDone: fn(),
    onSaved: fn(),
    api: createOrganizerStoryApi(),
  },
  render: (args) => <Harness {...args} />,
} satisfies Meta<typeof AccountOrganizer>;
export default meta;
type Story = StoryObj<typeof meta>;

async function row(canvasElement: HTMLElement, id: string) {
  let found: HTMLElement | null = null;
  await waitFor(() => {
    found = canvasElement.querySelector<HTMLElement>(`.ag-row[row-id="${id}"]`);
    expect(found).not.toBeNull();
  });
  return found!;
}
async function select(canvasElement: HTMLElement, id: string) {
  const element = await row(canvasElement, id);
  const checkbox = element.querySelector<HTMLElement>(
    ".ag-selection-checkbox input",
  )!;
  await userEvent.click(checkbox);
}
async function chooseMove(
  canvasElement: HTMLElement,
  destination = "Long-Term",
) {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(
    within(canvas.getByRole("toolbar")).getByRole("button", {
      name: "Move To…",
    }),
  );
  const dialog = within(await body.findByRole("dialog", { name: "Move To…" }));
  await userEvent.click(dialog.getByLabelText("Destination"));
  await userEvent.click(await body.findByRole("option", { name: destination }));
  return dialog;
}

export const BulkSubtreeMoveAndUndo: Story = {
  play: async ({ canvasElement, args }) => {
    await select(canvasElement, "investments");
    await select(canvasElement, "checking");
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("toolbar")).toHaveTextContent(
      "1 group and 1 account selected",
    );
    const dialog = await chooseMove(canvasElement);
    await expect(dialog.getByText(/3 included descendants/)).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole("dialog"),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(args.onSaved).toHaveBeenCalled());
    await expect(await row(canvasElement, "investments")).toHaveClass(
      "ag-row-level-1",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Undo" }));
    await waitFor(async () =>
      expect(await row(canvasElement, "investments")).toHaveClass(
        "ag-row-level-0",
      ),
    );
    await expect(canvas.getByRole("button", { name: "Undo" })).toBeDisabled();
  },
};

export const FindAndArchivedSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Find Accounts or Groups" }),
      "Old Fund",
    );
    const archived = await row(canvasElement, "archived");
    await expect(archived).toBeVisible();
    const virtual = await row(canvasElement, "__archived__:group:investments");
    await expect(
      within(virtual).queryByRole("checkbox"),
    ).not.toBeInTheDocument();
    await select(canvasElement, "archived");
    await expect(canvas.getByRole("toolbar")).toHaveTextContent(
      "0 groups and 1 account selected",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next Match" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous Match" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Selection" }),
    );
    await select(canvasElement, "empty");
    await expect(canvas.getByRole("toolbar")).toHaveTextContent(
      "1 group and 0 accounts selected",
    );
  },
};

export const RelativePlacementAndCashPreview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await select(canvasElement, "checking");
    const dialog = await chooseMove(canvasElement, "Cash");
    await expect(
      dialog.getByText(/changes the Cash Account setting for 1 item/),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const toolbar = within(canvas.getByRole("toolbar"));
    await userEvent.click(toolbar.getByRole("button", { name: "Move To…" }));
    const next = within(await body.findByRole("dialog"));
    await userEvent.click(next.getByLabelText("Position"));
    await userEvent.click(body.getByRole("option", { name: "Before" }));
    await userEvent.click(next.getByLabelText("Sibling"));
    await userEvent.click(body.getByRole("option", { name: "Investments" }));
    await userEvent.click(next.getByRole("button", { name: "Move" }));
    await waitFor(async () =>
      expect(await row(canvasElement, "checking")).toHaveClass(
        "ag-row-level-0",
      ),
    );
  },
};

export const DragIntoGroup: Story = {
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
    await expect(source).toHaveAttribute("row-index", "5");
    await expect(
      within(canvasElement).getByRole("button", { name: "Undo" }),
    ).toBeDisabled();
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
  play: async ({ canvasElement }) => {
    await select(canvasElement, "investments");
    await select(canvasElement, "nested");
    await select(canvasElement, "checking");
    const source = await row(canvasElement, "investments");
    const target = await row(canvasElement, "destination");
    let handle = source.querySelector<HTMLElement>(".ag-row-drag")!;
    let from = handle.getBoundingClientRect();
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
    const root = within(canvasElement).getByLabelText("Top Level Drop Target");
    const top = root.getBoundingClientRect();
    handle = (
      await row(canvasElement, "investments")
    ).querySelector<HTMLElement>(".ag-row-drag")!;
    from = handle.getBoundingClientRect();
    await userEvent.pointer([
      {
        target: handle,
        coords: { clientX: from.x + 5, clientY: from.y + 5 },
        keys: "[MouseLeft>]",
      },
      {
        target: root,
        coords: { clientX: top.x + 180, clientY: top.y + top.height / 2 },
      },
      {
        target: root,
        coords: { clientX: top.x + 182, clientY: top.y + top.height / 2 },
      },
      {
        target: root,
        coords: { clientX: top.x + 182, clientY: top.y + top.height / 2 },
        keys: "[/MouseLeft]",
      },
    ]);
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

export const BusyFailureAndRetry: Story = {
  render: (args) => <Harness {...args} failure="busy" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await select(canvasElement, "checking");
    const dialog = await chooseMove(canvasElement);
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "No changes were saved",
    );
    await expect(await row(canvasElement, "checking")).toHaveClass(
      "ag-row-level-0",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await userEvent.click(canvas.getByRole("button", { name: "Try Again" }));
    await waitFor(async () =>
      expect(await row(canvasElement, "checking")).toHaveClass(
        "ag-row-level-1",
      ),
    );
  },
};

export const UncertainFailureRequiresRefresh: Story = {
  render: (args) => <Harness {...args} failure="network" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await select(canvasElement, "checking");
    const dialog = await chooseMove(canvasElement);
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "could not confirm",
    );
    await expect(
      canvas.queryByRole("button", { name: "Try Again" }),
    ).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Refresh Choices" }),
    );
    await expect(await row(canvasElement, "checking")).toHaveClass(
      "ag-row-level-0",
    );
  },
};

export const LoadRecovery: Story = {
  render: (args) => <Harness {...args} failure="load" />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Could not load",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Refresh Choices" }),
    );
    await expect(await row(canvasElement, "checking")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await expect(args.onDone).toHaveBeenCalled();
  },
};
