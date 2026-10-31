import { Button, Stack } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ClassificationsPageView } from "./-page-view";

async function gridRow(canvasElement: HTMLElement, id: string) {
  const selector = `.ag-grid-scrolling-container > .ag-row[row-id="${id}"]:not(.ag-opacity-zero)`;
  await waitFor(() =>
    expect(canvasElement.querySelector(selector)).not.toBeNull(),
  );
  return canvasElement.querySelector<HTMLElement>(selector)!;
}
async function rowActions(canvasElement: HTMLElement, id: string) {
  const row = await gridRow(canvasElement, id);
  await userEvent.hover(row);
  return within(row);
}

const meta = {
  title: "Routes/Settings/Classifications",
  component: ClassificationsPageView,
  decorators: [
    (Story) => (
      <Stack h={600} mih={0}>
        <Story />
      </Stack>
    ),
  ],
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
    onReorder: fn(async () => {}),
    onRefresh: fn(async () => {}),
  },
} satisfies Meta<typeof ClassificationsPageView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Hierarchy: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("treegrid", { name: "Asset Classes" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("heading", { name: "Classifications" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Asset Class" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        canvasElement.querySelectorAll(
          ".ag-grid-scrolling-container > .ag-row:not(.ag-opacity-zero)",
        ),
      ).toHaveLength(3),
    );
    expect(
      Array.from(
        canvasElement.querySelectorAll(
          ".ag-grid-scrolling-container > .ag-row:not(.ag-opacity-zero)",
        ),
        (row) => row.getAttribute("row-id"),
      ),
    ).toEqual(["equities", "swiss", "cash"]);
    const equities = await gridRow(canvasElement, "equities");
    await expect(
      equities.querySelector('[col-id="accounts"]'),
    ).toHaveTextContent("1 active, 0 archived");
    await expect(equities).toHaveAttribute("aria-expanded", "true");
    const actions = await rowActions(canvasElement, "equities");
    await expect(
      actions.getByRole("button", { name: "Reorder Siblings" }),
    ).toBeEnabled();
    await expect(
      actions.getByRole("button", { name: "Delete Equities" }),
    ).toBeDisabled();
    const swiss = await rowActions(canvasElement, "swiss");
    await expect(
      swiss.getByRole("button", { name: "Reorder Siblings" }),
    ).toBeDisabled();
  },
};
export const CreateChild: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const actions = await rowActions(canvasElement, "equities");
    await userEvent.click(
      actions.getByRole("button", { name: "Add Child to Equities" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "New Asset Class" }),
    );
    await expect(dialog.getByLabelText("Parent Class")).toHaveValue("Equities");
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Name/ }),
      "International",
    );
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
    const body = within(canvasElement.ownerDocument.body);
    const parent = await rowActions(canvasElement, "equities");
    await expect(
      parent.getByRole("button", { name: "Delete Equities" }),
    ).toBeDisabled();
    const actions = await rowActions(canvasElement, "swiss");
    await userEvent.click(
      actions.getByRole("button", { name: "Delete Swiss Equities" }),
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
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Name/ }),
      "My Class",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "no longer available",
    );
    await expect(dialog.getByRole("textbox", { name: /^Name/ })).toHaveValue(
      "My Class",
    );
    await expect(args.onRefresh).toHaveBeenCalled();
  },
};
export const EditAndReorder: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    let actions = await rowActions(canvasElement, "swiss");
    await userEvent.click(
      actions.getByRole("button", { name: "Edit Swiss Equities" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Edit Asset Class" }),
    );
    const name = dialog.getByRole("textbox", { name: /^Name/ });
    await userEvent.clear(name);
    await userEvent.type(name, "Domestic Equities");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith({
        id: "swiss",
        name: "Domestic Equities",
        parentId: "equities",
      }),
    );
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    actions = await rowActions(canvasElement, "equities");
    await userEvent.click(
      actions.getByRole("button", { name: "Reorder Siblings" }),
    );
    const reorder = within(
      await body.findByRole("dialog", { name: "Reorder Siblings" }),
    );
    await waitFor(() =>
      expect(reorder.getByText("Siblings of Equities")).toBeVisible(),
    );
    await expect(
      await reorder.findByText("Cash", { exact: true }),
    ).toBeVisible();
    await expect(
      reorder.queryByText("Swiss Equities", { exact: true }),
    ).not.toBeInTheDocument();
    await userEvent.click(reorder.getByRole("button", { name: "Close" }));
  },
};
export const Empty: Story = {
  args: { nodes: [] },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        "No asset classes. Create one to start classifying accounts.",
      ),
    ).toBeVisible();
  },
};
function RefreshHarness(props: ComponentProps<typeof ClassificationsPageView>) {
  const [nodes, setNodes] = useState(props.nodes);
  return (
    <>
      <ClassificationsPageView {...props} nodes={nodes} />
      <Button
        onClick={() =>
          setNodes((current) =>
            current.map((node) => ({
              ...node,
              name: node.id === "equities" ? "Equities Updated" : node.name,
            })),
          )
        }
      >
        Refresh Fixture
      </Button>
    </>
  );
}
export const ExpansionSurvivesRefresh: Story = {
  render: (args) => <RefreshHarness {...args} />,
  play: async ({ canvasElement }) => {
    const parent = await gridRow(canvasElement, "equities");
    await userEvent.click(parent.querySelector(".ag-group-expanded")!);
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          '.ag-row[row-id="swiss"]:not(.ag-opacity-zero)',
        ),
      ).toBeNull(),
    );
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Refresh Fixture" }),
    );
    await waitFor(() =>
      expect(
        within(canvasElement).getByText("Equities Updated", { exact: true }),
      ).toBeVisible(),
    );
    await expect(await gridRow(canvasElement, "equities")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      canvasElement.querySelector(
        '.ag-row[row-id="swiss"]:not(.ag-opacity-zero)',
      ),
    ).toBeNull();
    const refreshed = await gridRow(canvasElement, "equities");
    await userEvent.click(refreshed.querySelector(".ag-group-contracted")!);
    await expect(await gridRow(canvasElement, "swiss")).toBeVisible();
  },
};
export const DeepHierarchy: Story = {
  args: {
    nodes: [
      ...meta.args.nodes,
      {
        id: "grandchild",
        name: "Pension",
        parentId: "swiss",
        sortOrder: 0,
        activeCount: 0,
        archivedCount: 0,
      },
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(await gridRow(canvasElement, "grandchild")).toBeVisible();
  },
};

async function dragClassSibling(
  dialog: HTMLElement,
  sourceId: string,
  targetId: string,
) {
  const source = dialog.querySelector<HTMLElement>(
    `.ag-row[row-id="${sourceId}"] .ag-row-drag`,
  )!;
  const target = dialog.querySelector<HTMLElement>(
    `.ag-row[row-id="${targetId}"]`,
  )!;
  const from = source.getBoundingClientRect(),
    to = target.getBoundingClientRect();
  const clientX = from.left + from.width / 2;
  await userEvent.pointer([
    {
      target: source,
      coords: { clientX, clientY: from.top + from.height / 2 },
      keys: "[MouseLeft>]",
    },
    { target, coords: { clientX, clientY: to.top + 3 } },
    { keys: "[/MouseLeft]" },
  ]);
}

export const ReorderFailureRestoresConfirmedOrder: Story = {
  play: async ({ canvasElement, args }) => {
    args.onReorder.mockRejectedValueOnce(
      new Error("The siblings changed. Refresh and reorder the updated list."),
    );
    const actions = await rowActions(canvasElement, "equities");
    await userEvent.click(
      actions.getByRole("button", { name: "Reorder Siblings" }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      "dialog",
      { name: "Reorder Siblings" },
    );
    await waitFor(() =>
      expect(
        dialog.querySelector('.ag-row[row-id="cash"] .ag-row-drag'),
      ).not.toBeNull(),
    );
    await dragClassSibling(dialog, "cash", "equities");
    await waitFor(() =>
      expect(args.onReorder).toHaveBeenCalledWith(null, ["cash", "equities"]),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "The siblings changed",
    );
    expect(args.onRefresh).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        dialog.querySelector('.ag-row[row-index="0"] [col-id="name"]'),
      ).toHaveTextContent("Equities"),
    );
    await dragClassSibling(dialog, "cash", "equities");
    await waitFor(() => expect(args.onReorder).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument(),
    );
  },
};
