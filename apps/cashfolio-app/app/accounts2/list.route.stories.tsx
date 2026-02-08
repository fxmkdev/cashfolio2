import type { Meta, StoryObj } from "@storybook/react-vite";
import ListRoute from "./list.route";
import { createRoutesStub } from "react-router";
import GridRoute, { mockData } from "./grid.route";

const meta: Meta<typeof ListRoute> = {
  title: "Accounts2 / List Route",
  component: ListRoute,
  decorators: [
    (Story) => {
      const Stub = createRoutesStub([
        {
          path: "/",
          Component: Story,
          children: [
            {
              path: ":type",
              Component: GridRoute,
              loader: () => ({
                data: mockData,
              }),
            },
          ],
        },
      ]);

      return <Stub initialEntries={["/assets"]} />;
    },
  ],
};

export default meta;
type Story = StoryObj<typeof ListRoute>;

export const Default: Story = {
  args: {},
};
