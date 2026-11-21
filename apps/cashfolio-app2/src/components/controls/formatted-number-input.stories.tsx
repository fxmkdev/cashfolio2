import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { StoryValue } from "../testing/story-value";
import { expect, fn, userEvent, within } from "storybook/test";
import { USER_LOCALE_OPTIONS } from "@/user-locale";
import { FormattedNumberInput } from "./formatted-number-input";

const meta = {
  component: FormattedNumberInput,
  title: "Components/Controls/Formatted Number Input",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Locale-aware amount entry. Uses the toolbar locale unless an explicit locale prop is supplied. Controls and typing both update the value. Configure decimalScale, validation, and disabled/read-only states for the form's requirements.",
      },
    },
  },
  argTypes: {
    value: { control: "text" },
    decimalScale: { control: "number" },
    disabled: { control: "boolean" },
    readOnly: { control: "boolean" },
    locale: {
      options: ["toolbar", ...USER_LOCALE_OPTIONS.map(({ value }) => value)],
      mapping: { toolbar: undefined },
      control: {
        type: "select",
        labels: {
          toolbar: "Toolbar Locale",
          ...Object.fromEntries(
            USER_LOCALE_OPTIONS.map(({ value, label }) => [value, label]),
          ),
        },
      },
      description:
        "Optional override of the user locale selected in the toolbar.",
    },
  },
  args: {
    label: "Amount",
    name: "amount",
    value: "1234.56",
    locale: "toolbar",
    hideControls: true,
    onChange: fn(),
  },
  render: function Render(args) {
    const [, updateArgs] = useArgs();
    return (
      <StoryValue value={args.value}>
        {(value, setValue) => (
          <FormattedNumberInput
            {...args}
            value={value}
            onChange={(value) => {
              setValue(value);
              updateArgs({ value: String(value) });
              args.onChange?.(value);
            }}
          />
        )}
      </StoryValue>
    );
  },
} satisfies Meta<typeof FormattedNumberInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const USLocale: Story = {
  args: { locale: "en-US" },
  parameters: {
    docs: {
      description: {
        story:
          "Explicit en-US formatting takes precedence over the toolbar locale.",
      },
    },
  },
};
export const SwissLocale: Story = {
  args: { locale: "de-CH" },
  parameters: {
    docs: {
      description: {
        story:
          "Explicit de-CH formatting takes precedence over the toolbar locale.",
      },
    },
  },
};
export const Empty: Story = { args: { value: "" } };
export const Negative: Story = { args: { value: "-1234.56" } };
export const DecimalPrecision: Story = {
  args: { value: "12.3", decimalScale: 4, fixedDecimalScale: true },
};
export const Disabled: Story = { args: { disabled: true } };
export const ReadOnly: Story = { args: { readOnly: true } };
export const ValidationError: Story = {
  args: { error: "Enter an amount greater than zero.", value: "-10" },
};
export const EditableView: Story = {
  args: { value: "", locale: "en-US" },
  parameters: {
    docs: {
      description: {
        story: "Uses en-US for a repeatable typing demonstration.",
      },
    },
  },
  name: "Editable Playground",
  tags: ["!regression"],
  play: undefined,
};

export const Editable: Story = {
  ...EditableView,
  name: "Editable Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByRole("textbox", {
      name: "Amount",
    });
    await userEvent.type(input, "1234.56");
    await expect(input).toHaveValue("1,234.56");
    await expect(args.onChange).toHaveBeenLastCalledWith(1234.56);
  },
};
