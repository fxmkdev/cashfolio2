import type { Meta, StoryObj } from "@storybook/react-vite";
import { SplitTransaction } from "./split-transaction";
import { Unit } from "~/.prisma-client/enums";

const meta: Meta<typeof SplitTransaction> = {
  title: "Accounts2 / Split Transaction",
  component: SplitTransaction,
};

export default meta;
type Story = StoryObj<typeof SplitTransaction>;

export const Default: Story = {
  args: {},
};

export const WithInitialData: Story = {
  args: {
    initialValues: {
      description: "Grocery Store Purchase",
      bookings: [
        {
          date: "2024-01-01",
          account: "account-1",
          description: "Grocery Store",
          unit: Unit.CURRENCY,
          currency: "CHF",
          debit: 50,
        },
        {
          date: "2024-01-01",
          account: "account-2",
          description: "Checking Account",
          unit: Unit.CURRENCY,
          currency: "CHF",
          credit: 50,
        },
      ],
    },
  },
};
