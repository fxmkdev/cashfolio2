import type { Meta, StoryObj } from "@storybook/react-vite";
import { SplitTransaction } from "./split-transaction";
import { EditAccountModal } from "./edit-account-modal";

const meta: Meta<typeof EditAccountModal> = {
  title: "Accounts2 / Edit Account Modal",
  component: EditAccountModal,
};

export default meta;
type Story = StoryObj<typeof EditAccountModal>;

export const Default: Story = {
  args: {
    opened: true,
    accountGroups: [
      { value: "group-1", label: "Group 1" },
      { value: "group-2", label: "Group 2" },
      { value: "group-3", label: "Group 3" },
    ],
  },
};
