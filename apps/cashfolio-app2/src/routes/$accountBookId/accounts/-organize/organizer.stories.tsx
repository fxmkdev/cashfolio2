import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { createOrganizerStoryApi, organizeStoryNodes } from "./story-fixtures";
import {
  organizerStoryMeta,
  Harness,
  row,
  select,
  chooseMove,
  type OrganizerStory as Story,
} from "./story-harness";
const meta = {
  ...organizerStoryMeta,
  title: "Routes/Accounts/Organize",
  component: Harness,
};
export default meta;

export const BulkSubtreeMove: Story = {
  play: async ({ canvasElement, args }) => {
    await select(canvasElement, "investments");
    await select(canvasElement, "checking");
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("toolbar", { name: "Organize Account Actions" }),
    ).toHaveTextContent("1 group and 1 account selected");
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
  },
};

export const ArchivedSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    );
    await waitFor(async () =>
      expect(await row(canvasElement, "archived")).toBeVisible(),
    );
    await select(canvasElement, "archived");
    await expect(
      canvas.getByRole("toolbar", { name: "Organize Account Actions" }),
    ).toHaveTextContent("0 groups and 1 account selected");
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Selection" }),
    );
    await select(canvasElement, "empty");
    await expect(
      canvas.getByRole("toolbar", { name: "Organize Account Actions" }),
    ).toHaveTextContent("1 group and 0 accounts selected");
  },
};

export const ArchivedVisibilityAndSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    );
    const nested = await row(canvasElement, "nested");
    await userEvent.click(
      nested.querySelector<HTMLElement>(".ag-group-contracted")!,
    );
    await expect(await row(canvasElement, "holding")).toBeVisible();
    const gridTop = canvas.getByRole("treegrid").getBoundingClientRect().top;
    await select(canvasElement, "archived");
    await select(canvasElement, "empty");
    await expect(
      canvas.getByRole("treegrid").getBoundingClientRect().top,
    ).toBeCloseTo(gridTop, 0);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    );
    await waitFor(() =>
      expect(canvasElement.querySelector('[row-id="archived"]')).toBeNull(),
    );
    await expect(
      canvas.getByRole("toolbar", { name: "Organize Account Actions" }),
    ).toHaveTextContent("1 group and 0 accounts selected");
    await expect(
      canvas.getByText(/1 hidden archived item was deselected/),
    ).toBeInTheDocument();
    await expect(await row(canvasElement, "holding")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    );
    await expect(
      (await row(canvasElement, "archived")).querySelector(
        ".ag-selection-checkbox input",
      ),
    ).not.toBeChecked();
    await expect(await row(canvasElement, "holding")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Selection" }),
    );
    await expect(
      canvas.queryByRole("toolbar", { name: "Organize Account Actions" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    );
    await select(canvasElement, "investments");
    const dialog = await chooseMove(canvasElement);
    await expect(
      dialog.getByText(/3 included descendants \(1 archived\)/),
    ).toBeVisible();
    await expect(
      canvas.getByRole("checkbox", { name: "Show Archived" }),
    ).toBeDisabled();
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Selection" }),
    );
    await select(canvasElement, "checking");
    const anchors = await chooseMove(canvasElement, "Investments");
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(anchors.getByRole("radio", { name: "Before" }));
    await userEvent.click(anchors.getByLabelText("Sibling"));
    await expect(body.getByRole("option", { name: "Brokerage" })).toBeVisible();
    await expect(
      body.queryByRole("option", { name: "Old Fund (Archived)" }),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(anchors.getByRole("button", { name: "Cancel" }));
  },
};

export const ArchivedOnlyEmptyState: Story = {
  args: {
    api: createOrganizerStoryApi(
      undefined,
      organizeStoryNodes
        .filter((node) => !node.isActive)
        .map((node) => ({ ...node, parentId: null })),
    ),
  },
  render: (args) => <Harness {...args} useProvidedApi />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/There are no active accounts or groups/),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Show Archived" }),
    );
    await expect(await row(canvasElement, "archived")).toBeVisible();
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
    const toolbar = within(
      canvas.getByRole("toolbar", { name: "Organize Account Actions" }),
    );
    await userEvent.click(toolbar.getByRole("button", { name: "Move To…" }));
    const next = within(await body.findByRole("dialog"));
    await userEvent.click(next.getByRole("radio", { name: "Before" }));
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

export const DestinationTreeAndSegmentedPosition: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Move Checking" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Move To…" }),
    );
    const destination = dialog.getByLabelText("Destination");
    const position = within(
      dialog.getByRole("radiogroup", { name: "Position" }),
    );
    await expect(destination).toHaveValue("Top Level");
    await expect(position.getByRole("radio", { name: "Last" })).toBeChecked();
    await userEvent.click(destination);
    const parent = body
      .getAllByRole("option")
      .find((option) =>
        within(option).queryByText("Investments", { exact: true }),
      )!;
    await expect(parent).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(
      within(parent).getByRole("button", { name: "Expand" }),
    );
    const nested = body.getByRole("option", { name: "Brokerage" });
    await expect(nested).toHaveAttribute("aria-level", "2");
    await userEvent.click(nested);
    await expect(destination).toHaveValue("Brokerage");
    await userEvent.click(position.getByRole("radio", { name: "Last" }));
    await userEvent.keyboard("{ArrowRight}");
    await expect(position.getByRole("radio", { name: "Before" })).toBeChecked();
    await userEvent.click(dialog.getByLabelText("Sibling"));
    await userEvent.click(body.getByRole("option", { name: "Fund" }));
    await expect(dialog.getByRole("button", { name: "Move" })).toBeEnabled();
    await userEvent.click(destination);
    await userEvent.click(body.getByRole("option", { name: "Empty Group" }));
    await expect(
      position.getByRole("radio", { name: "Before" }),
    ).toBeDisabled();
    await expect(position.getByRole("radio", { name: "After" })).toBeDisabled();
    await userEvent.click(position.getByRole("radio", { name: "Last" }));
    await expect(dialog.queryByLabelText("Sibling")).not.toBeInTheDocument();
    await userEvent.click(destination);
    await userEvent.clear(destination);
    await userEvent.type(destination, "  INVESTMENTS / brokerage  ");
    await userEvent.click(body.getByRole("option", { name: "Brokerage" }));
    await expect(destination).toHaveValue("Brokerage");
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  },
};

export const BusyFailureAndRetry: Story = {
  render: (args) => <Harness {...args} failure="busy" />,
  play: async ({ canvasElement }) => {
    await select(canvasElement, "checking");
    const dialog = await chooseMove(canvasElement);
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "No changes were saved",
    );
    await expect(await row(canvasElement, "checking")).toHaveClass(
      "ag-row-level-0",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Try Again" }));
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).queryByRole("dialog"),
      ).not.toBeInTheDocument(),
    );
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
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "could not confirm",
    );
    await expect(
      dialog.queryByRole("button", { name: "Try Again" }),
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

export const MoveDialogRecoveryFeedback: Story = {
  args: { api: createOrganizerStoryApi("network") },
  render: (args) => <Harness {...args} useProvidedApi />,
  play: async ({ canvasElement, args }) => {
    await select(canvasElement, "checking");
    const original = args.api.load;
    args.api.load = fn(original).mockRejectedValueOnce(new Error("Offline"));
    try {
      const dialog = await chooseMove(canvasElement);
      await userEvent.click(dialog.getByRole("button", { name: "Move" }));
      await waitFor(() => expect(dialog.getAllByRole("alert")).toHaveLength(2));
      await expect(dialog.getByRole("button", { name: "Move" })).toBeDisabled();
      await expect(dialog.getByLabelText("Destination")).toBeDisabled();
      await expect(
        dialog.getByRole("button", { name: "Cancel" }),
      ).toBeEnabled();
      await expect(
        dialog.queryByRole("button", { name: "Try Again" }),
      ).not.toBeInTheDocument();
      await userEvent.click(
        dialog.getByRole("button", { name: "Refresh Choices" }),
      );
      await waitFor(() =>
        expect(dialog.getByRole("button", { name: "Move" })).toBeEnabled(),
      );
      await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    } finally {
      args.api.load = original;
    }
  },
};
