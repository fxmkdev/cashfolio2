import type { Meta, StoryObj } from "@storybook/react-vite";
import { createRoutesStub } from "react-router";
import LedgerRoute from "./ledger.route";

const meta: Meta<typeof LedgerRoute> = {
  title: "Accounts2 / Ledger Route",
  component: LedgerRoute,
  decorators: [
    // (Story) => {
    //   const Stub = createRoutesStub([
    //     {
    //       path: "*",
    //       Component: Story,
    //       loader: () => ({
    //         data: mockData,
    //       }),
    //     },
    //   ]);
    //   return <Stub initialEntries={["/"]} />;
    // },
  ],
};

export default meta;
type Story = StoryObj<typeof LedgerRoute>;

export const Default: Story = {
  args: {
    name: "Checking Account",
    unit: "CURRENCY",
    currency: "CHF",
    data: [
      {
        date: "2024-01-03",
        accounts: [
          {
            id: "account-1",
            name: "Grocery Store",
          },
        ],
        bookings: [
          {
            date: "2024-01-03",
            account: "account-1",
            description: "Grocery Store",
            unit: "CURRENCY",
            currency: "CHF",
            debit: 200,
          },
          {
            date: "2024-01-03",
            account: "account-2",
            description: "Checking Account",
            unit: "CURRENCY",
            currency: "CHF",
            credit: 200,
          },
        ],
        description: "Grocery shopping",
        credit: 200,
        balance: 16_800,
      },
      {
        date: "2024-01-02",
        accounts: [
          {
            id: "account-1",
            name: "Salary",
          },
        ],
        bookings: [
          {
            date: "2024-01-02",
            account: "account-1",
            description: "Salary",
            unit: "CURRENCY",
            currency: "CHF",
            debit: 5000,
          },
          {
            date: "2024-01-02",
            account: "account-2",
            description: "Checking Account",
            unit: "CURRENCY",
            currency: "CHF",
            credit: 5000,
          },
        ],
        description: "Monthly salary",
        debit: 5000,
        balance: 17_000,
      },
      {
        date: "",
        accounts: [],
        bookings: [],
        description: "Opening balance",
        balance: 12000,
      },
    ],
  },
};
