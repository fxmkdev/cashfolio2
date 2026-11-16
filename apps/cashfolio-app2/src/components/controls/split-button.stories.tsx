import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Group } from "@mantine/core";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconFileImport,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { SplitButton, SplitButtonGroup } from "./split-button";

const meta = {
  title: "Components/Controls/Split Button",
  parameters: {
    docs: {
      description: {
        component:
          "Combines a primary action with related menu actions. Configure children, primaryDisabled, variant, and menuLabel in Controls; supply menuItems for secondary actions.",
      },
    },
  },
  tags: ["autodocs"],
  component: SplitButton,
  args: {
    children: "Edit",
    menuItems: [],
    onClick: () => undefined,
  },
  argTypes: {
    children: { control: "text" },
    menuLabel: { control: "text" },
    primaryDisabled: { control: "boolean" },
    menuItems: { control: false },
  },
} satisfies Meta<typeof SplitButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AccountAction: Story = {
  args: {
    children: "Import Statement",
    leftSection: <IconFileImport size={16} />,
    menuLabel: "Account Actions",
    menuItems: [
      {
        key: "edit",
        label: "Edit",
        leftSection: <IconPencil size={16} />,
        onClick: () => undefined,
      },
      { type: "divider", key: "danger-divider" },
      {
        key: "delete",
        label: "Delete",
        color: "red",
        leftSection: <IconTrash size={16} />,
        onClick: () => undefined,
      },
    ],
  },
};

export const ThreePartControl: Story = {
  render: () => (
    <Group>
      <SplitButtonGroup>
        <Button variant="default" px="xs" aria-label="Previous Period">
          <IconChevronLeft size={16} />
        </Button>
        <Button variant="default" w={160} justify="center">
          <Group gap="xs" wrap="nowrap">
            <span>May 2026</span>
            <IconChevronDown size={16} />
          </Group>
        </Button>
        <Button variant="default" px="xs" aria-label="Next Period">
          <IconChevronRight size={16} />
        </Button>
      </SplitButtonGroup>
    </Group>
  ),
};
