import type { Meta, StoryObj } from "@storybook/react-vite";
import GridRoute, { mockData } from "./grid.route";
import { createRoutesStub } from "react-router";

const meta: Meta<typeof GridRoute> = {
  title: "Accounts2 / Grid Route",
  component: GridRoute,
  decorators: [
    (Story) => {
      const Stub = createRoutesStub([
        {
          path: "*",
          Component: Story,
          loader: () => ({
            data: mockData,
          }),
        },
      ]);

      return <Stub initialEntries={["/"]} />;
    },
  ],
};

export default meta;
type Story = StoryObj<typeof GridRoute>;

export const Default: Story = {
  args: {},
};
