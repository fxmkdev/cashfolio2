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
  args: {},
};
