import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Group } from "@mantine/core";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { SplitButton, SplitButtonGroup } from "./split-button";

const meta = {
  title: "Components/SplitButton",
  component: SplitButton,
  args: {
    children: "Edit",
    menuItems: [],
    onClick: () => undefined,
  },
} satisfies Meta<typeof SplitButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AccountAction: Story = {
  render: () => (
    <SplitButton
      leftSection={<IconPencil size={16} />}
      menuLabel="Account actions"
      onClick={() => undefined}
      menuItems={[
        {
          key: "delete",
          label: "Delete",
          color: "red",
          leftSection: <IconTrash size={16} />,
          onClick: () => undefined,
        },
      ]}
    >
      Edit
    </SplitButton>
  ),
};

export const ThreePartControl: Story = {
  render: () => (
    <Group>
      <SplitButtonGroup>
        <Button variant="default" px="xs" aria-label="Previous Period">
          <IconChevronLeft size={16} />
        </Button>
        <Button
          variant="default"
          rightSection={<IconChevronDown size={16} />}
          w={160}
          justify="space-between"
        >
          May 2026
        </Button>
        <Button variant="default" px="xs" aria-label="Next Period">
          <IconChevronRight size={16} />
        </Button>
      </SplitButtonGroup>
    </Group>
  ),
};
