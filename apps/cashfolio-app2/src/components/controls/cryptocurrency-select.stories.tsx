import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { StoryValue } from "../testing/story-value";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { CryptocurrencySelect } from "./unit-select";

const meta = {
  title: "Components/Controls/Cryptocurrency Select",
  component: CryptocurrencySelect,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Searchable cryptocurrency selection. Units already used in the account book appear first. compactLabels switches between codes and full labels; selected unknown units remain selectable. Typing and Controls share the current value.",
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
    label: "Cryptocurrency",
    value: "BTC",
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
          <CryptocurrencySelect
            {...args}
            value={value}
            selectedCryptocurrency={value}
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
} satisfies Meta<typeof CryptocurrencySelect>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const UsedUnits: Story = {
  args: { usedCryptocurrencies: ["BTC", "ETH"] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Cryptocurrency" }),
    );
    await expect(body.getByText("Used", { exact: true })).toBeVisible();
    await userEvent.click(body.getByRole("option", { name: "ETH" }));
    await waitFor(() =>
      expect(
        canvas.getByRole("combobox", { name: "Cryptocurrency" }),
      ).toHaveValue("ETH"),
    );
    await expect(args.onChange).toHaveBeenLastCalledWith(
      "ETH",
      expect.objectContaining({ value: "ETH" }),
    );
  },
};
export const FullLabels: Story = { args: { compactLabels: false } };
export const SearchWithNoMatches: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Cryptocurrency" });
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
      within(canvasElement).getByRole("combobox", { name: "Cryptocurrency" }),
    ).toHaveValue("LEGACY");
  },
};
