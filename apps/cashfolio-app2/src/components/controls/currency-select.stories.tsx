import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { StoryValue } from "../testing/story-value";
import { expect, fn, userEvent, within } from "storybook/test";
import { CurrencySelect } from "./unit-select";

const meta = {
  title: "Components/Controls/Currency Select",
  component: CurrencySelect,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Searchable currency selection. Units already used in the account book appear first. compactLabels switches between codes and full labels; selected unknown units remain selectable. Typing and Controls share the current value. Open the selector to browse units; type not-a-unit to inspect the empty search result. No selection or search runs automatically.",
      },
    },
  },
  argTypes: {
    value: { control: "text" },
    compactLabels: { control: "boolean" },
    disabled: { control: "boolean" },
    searchable: { control: "boolean" },
  },
  args: {
    label: "Currency",
    value: "CHF",
    compactLabels: true,
    searchable: true,
    clearable: true,
    nothingFoundMessage: "No matching units",
    onChange: fn(),
  },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return (
      <StoryValue value={args.value}>
        {(value, setValue) => (
          <CurrencySelect
            {...args}
            value={value}
            selectedCurrency={value}
            onChange={(value, option) => {
              setValue(value);
              updateArgs({ value });
              args.onChange?.(value, option);
            }}
          />
        )}
      </StoryValue>
    );
  },
} satisfies Meta<typeof CurrencySelect>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const UsedUnitsView: Story = {
  args: { usedCurrencies: ["CHF", "USD"] },
  name: "Used Units Playground",
  tags: ["!regression"],
  play: undefined,
};

export const UsedUnits: Story = {
  ...UsedUnitsView,
  name: "Used Units Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Currency" }));
    await expect(body.getByText("Used", { exact: true })).toBeVisible();
    await userEvent.click(body.getByRole("option", { name: "USD" }));
    await expect(
      canvas.getByRole("combobox", { name: "Currency" }),
    ).toHaveValue("USD");
    await expect(args.onChange).toHaveBeenLastCalledWith(
      "USD",
      expect.objectContaining({ value: "USD" }),
    );
  },
};
export const FullLabels: Story = { args: { compactLabels: false } };
export const SearchWithNoMatches: Story = {
  ...Default,
  name: "Search With No Matches Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Currency" });
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, "not-a-unit");
    await expect(
      within(canvasElement.ownerDocument.body).getByText("No matching units"),
    ).toBeVisible();
  },
};
export const Disabled: Story = { args: { disabled: true } };
export const SelectedUnknownUnit: Story = {
  args: { value: "LEGACY" },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("combobox", { name: "Currency" }),
    ).toHaveValue("LEGACY");
  },
};
