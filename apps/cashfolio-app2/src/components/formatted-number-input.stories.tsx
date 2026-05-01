import type { Meta, StoryObj } from "@storybook/react-vite";
import { FormattedNumberInput } from "./formatted-number-input";

const meta = {
  component: FormattedNumberInput,
  title: "Components/FormattedNumberInput",
  args: {
    label: "Amount",
    name: "amount",
    value: "1234.56",
    hideControls: true,
    locale: "en-CH",
  },
} satisfies Meta<typeof FormattedNumberInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const USLocale: Story = {
  args: {
    locale: "en-US",
  },
};
