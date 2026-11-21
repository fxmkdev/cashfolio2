import { useArgs } from "storybook/preview-api";
import { StoryValue } from "../testing/story-value";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AssetClassTreeSelect } from "./asset-class-tree-select";

const meta = {
  title: "Components/Controls/Asset Class Tree Select",
  parameters: {
    docs: {
      description: {
        component:
          "Select an asset class from a hierarchy. Supports parent selection, path search, keyboard navigation, and an unclassified value.",
      },
    },
  },
  tags: ["autodocs"],
  component: AssetClassTreeSelect,
  args: {
    label: "Asset Class",
    openOnFocus: false,
    clearable: true,
    clearButtonProps: { "aria-label": "Clear Asset Class" },
    placeholder: "Unclassified",
    unclassifiedValue: "",
    onChange: fn(),
    nodes: [
      { id: "swiss", name: "Swiss Shares", parentId: "equities", sortOrder: 0 },
      { id: "cash", name: "Cash", parentId: null, sortOrder: 1 },
      { id: "equities", name: "Equities", parentId: null, sortOrder: 0 },
    ],
  },
} satisfies Meta<typeof AssetClassTreeSelect>;
export default meta;
type Story = StoryObj<typeof meta>;

export const HierarchyAndParentSelectionView: Story = {
  parameters: {
    manualSetup:
      "Open Asset Class to expand Equities and choose a parent or child. Type a hierarchy path to search; use Clear to return to Unclassified.",
  },
  name: "Hierarchy And Parent Selection Playground",
  tags: ["!regression"],
  play: undefined,
};

export const HierarchyAndParentSelection: Story = {
  ...HierarchyAndParentSelectionView,
  name: "Hierarchy And Parent Selection Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const input = canvas.getByRole("textbox", { name: "Asset Class" });
    await userEvent.click(input);
    expect(body.queryByRole("option", { name: "Swiss Shares" })).toBeNull();
    const parent = body
      .getByText("Equities", { exact: true })
      .closest<HTMLElement>('[role="option"]')!;
    await expect(parent).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(
      within(parent).getByRole("button", { name: "Expand" }),
    );
    const child = body.getByRole("option", { name: "Swiss Shares" });
    await expect(child).toHaveAttribute("aria-level", "2");
    await userEvent.click(child);
    await expect(input).toHaveValue("Swiss Shares");
    await expect(args.onChange).toHaveBeenLastCalledWith("swiss");
    await userEvent.click(input);
    await userEvent.click(body.getByText("Equities", { exact: true }));
    await expect(input).toHaveValue("Equities");
    await expect(args.onChange).toHaveBeenLastCalledWith("equities");
  },
};

export const PathSearchAndKeyboard: Story = {
  ...HierarchyAndParentSelectionView,
  name: "Path Search And Keyboard Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const input = canvas.getByRole("textbox", { name: "Asset Class" });
    await userEvent.click(input);
    await userEvent.type(input, "  EQUITIES / swiss  ");
    await expect(
      body.getByRole("option", { name: "Swiss Shares" }),
    ).toBeVisible();
    await expect(body.queryByRole("option", { name: "Cash" })).toBeNull();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    await expect(input).toHaveValue("Swiss Shares");
    await expect(args.onChange).toHaveBeenLastCalledWith("swiss");
  },
};

export const ClearAndUnclassifiedView: Story = {
  parameters: {
    manualSetup:
      "Clear Swiss Shares to inspect the empty value, then choose Unclassified from the tree.",
  },
  args: { defaultValue: "swiss" },
  name: "Clear And Unclassified Playground",
  tags: ["!regression"],
  play: undefined,
};

export const ClearAndUnclassified: Story = {
  ...ClearAndUnclassifiedView,
  name: "Clear And Unclassified Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const input = canvas.getByRole("textbox", { name: "Asset Class" });
    await expect(input).toHaveValue("Swiss Shares");
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Asset Class" }),
    );
    await expect(args.onChange).toHaveBeenLastCalledWith(null);
    await expect(input).toHaveValue("");
    await userEvent.click(input);
    await userEvent.click(body.getByRole("option", { name: "Unclassified" }));
    await expect(args.onChange).toHaveBeenLastCalledWith("");
  },
};

export const Default: Story = {
  args: { value: null },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return (
      <StoryValue value={args.value}>
        {(value, setValue) => (
          <AssetClassTreeSelect
            {...args}
            value={value}
            onChange={(value) => {
              setValue(value);
              updateArgs({ value });
              args.onChange?.(value);
            }}
          />
        )}
      </StoryValue>
    );
  },
};
