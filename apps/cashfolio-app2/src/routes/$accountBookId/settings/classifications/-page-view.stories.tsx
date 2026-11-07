import { createAssetClassStoryApi } from "@/components/hierarchy-organize/asset-class-story-fixtures";
import { Stack } from "@mantine/core";
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
  return (label: string) =>
    within(row).getByRole("button", { name: new RegExp(`^${label} `) });
}

function ManagementHarness(
  props: ComponentProps<typeof ClassificationsPageView>,
) {
  const [api] = useState(() =>
    createAssetClassStoryApi(
      props.nodes.map((node) => ({ ...node, nodeType: "assetClass" as const })),
    ),
  );
  const [organizerApi] = useState(() => ({
    ...api,
    delete: async (
      target: Parameters<typeof api.delete>[0],
      replacementId?: string | null,
    ) => {
      await props.onDelete(target.id, replacementId ?? null);
      await api.delete(target, replacementId);
    },
  }));
  return (
    <ClassificationsPageView
      {...props}
      organizerApi={organizerApi}
      onSave={async (draft) => {
        await props.onSave(draft);
        await api.save(draft);
      }}
    />
  );
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
  render: (args) => <ManagementHarness {...args} />,
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
    await expect(actions("Delete")).toBeDisabled();
  },
};
export const CreateChild: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const actions = await rowActions(canvasElement, "equities");
    await userEvent.click(actions("Add Child"));
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
    await expect(parent("Delete")).toBeDisabled();
    const actions = await rowActions(canvasElement, "swiss");
    await userEvent.click(actions("Delete"));
    const dialog = within(
      await body.findByRole("dialog", { name: "Delete Asset Class" }),
    );
    await expect(dialog.getByText(/2 active and 1 archived/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Delete" })).toBeDisabled();
    await userEvent.click(dialog.getByLabelText("Replacement Asset Class"));
    await expect(
      body.queryByRole("option", { name: "Swiss Equities" }),
    ).not.toBeInTheDocument();
    await userEvent.click(body.getByRole("option", { name: "Unclassified" }));
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(args.onDelete).toHaveBeenCalledWith("swiss", null),
    );
  },
};

export const ParentSelectionExcludesSubtree: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const actions = await rowActions(canvasElement, "equities");
    await userEvent.click(actions("Edit"));
    const dialog = within(
      await body.findByRole("dialog", { name: "Edit Asset Class" }),
    );
    const parent = dialog.getByLabelText("Parent Class");
    await userEvent.click(parent);
    await expect(body.queryByRole("option", { name: /Equities/ })).toBeNull();
    await expect(
      body.queryByRole("option", { name: "Swiss Equities" }),
    ).toBeNull();
    await userEvent.click(body.getByRole("option", { name: "Cash" }));
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith({
        id: "equities",
        name: "Equities",
        parentId: "cash",
      }),
    );
  },
};

export const ClearParentToTopLevel: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const actions = await rowActions(canvasElement, "swiss");
    await userEvent.click(actions("Edit"));
    const dialog = within(
      await body.findByRole("dialog", { name: "Edit Asset Class" }),
    );
    const parent = dialog.getByLabelText("Parent Class");
    await expect(parent).toHaveValue("Equities");
    await userEvent.click(
      dialog.getByRole("button", { name: "Clear Parent Class" }),
    );
    await expect(parent).toHaveValue("");
    await expect(parent).toHaveAttribute("placeholder", "Top Level");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith({
        id: "swiss",
        name: "Swiss Equities",
        parentId: null,
      }),
    );
  },
};

export const NestedParentSelection: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "New Asset Class" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "New Asset Class" }),
    );
    await userEvent.type(
      dialog.getByRole("textbox", { name: /^Name/ }),
      "Pension",
    );
    const parent = dialog.getByLabelText("Parent Class");
    await userEvent.click(parent);
    await userEvent.type(parent, "Equities / Swiss");
    await userEvent.click(body.getByRole("option", { name: "Swiss Equities" }));
    await expect(parent).toHaveValue("Swiss Equities");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(args.onSave).toHaveBeenCalledWith({
        id: undefined,
        name: "Pension",
        parentId: "swiss",
      }),
    );
  },
};

export const NestedReplacementSelection: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    const actions = await rowActions(canvasElement, "cash");
    await userEvent.click(actions("Delete"));
    const dialog = within(
      await body.findByRole("dialog", { name: "Delete Asset Class" }),
    );
    const replacement = dialog.getByLabelText("Replacement Asset Class");
    await userEvent.click(replacement);
    await userEvent.type(replacement, "Equities / Swiss");
    await userEvent.click(body.getByRole("option", { name: "Swiss Equities" }));
    await expect(replacement).toHaveValue("Swiss Equities");
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(args.onDelete).toHaveBeenCalledWith("cash", "swiss"),
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
    await expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled();
  },
};
export const Edit: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    let actions = await rowActions(canvasElement, "swiss");
    await userEvent.click(actions("Edit"));
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
  },
};
export const Empty: Story = {
  args: { nodes: [] },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        "There are no asset classes to organize.",
      ),
    ).toBeVisible();
  },
};
export const ExpansionSurvivesRefresh: Story = {
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
    const actions = await rowActions(canvasElement, "equities");
    await userEvent.click(actions("Edit"));
    const body = within(canvasElement.ownerDocument.body);
    const editor = within(
      await body.findByRole("dialog", { name: "Edit Asset Class" }),
    );
    await userEvent.clear(editor.getByRole("textbox", { name: /^Name/ }));
    await userEvent.type(
      editor.getByRole("textbox", { name: /^Name/ }),
      "Equities Updated",
    );
    await userEvent.click(editor.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
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
    await waitFor(async () =>
      expect(await gridRow(canvasElement, "swiss")).toBeVisible(),
    );
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
