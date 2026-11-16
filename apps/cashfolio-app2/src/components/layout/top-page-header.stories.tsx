import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge, Button, Group, Text, Title } from "@mantine/core";
import { IconBolt, IconListDetails } from "@tabler/icons-react";
import { TopPageHeader } from "./top-page-header";

const meta = {
  title: "Components/Layout/Top Page Header",
  parameters: {
    docs: {
      description: {
        component:
          "Shared page heading with optional accessory, description, and actions. Use responsive layout when the identity and actions must wrap at narrow widths.",
      },
    },
  },
  tags: ["autodocs"],
  component: TopPageHeader,
  argTypes: {
    heading: { control: "text" },
    layout: { control: "inline-radio", options: ["default", "responsive"] },
    headingAccessory: { control: false },
    actions: { control: false },
    description: { control: false },
  },
  args: {
    heading: "February 2026",
  },
} satisfies Meta<typeof TopPageHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TitleHeading: Story = {
  render: (args) => (
    <TopPageHeader
      {...args}
      heading={<Title order={2}>{args.heading}</Title>}
      actions={
        <Button variant="default" leftSection={<IconListDetails size={16} />}>
          Accounts
        </Button>
      }
    />
  ),
};

export const TitleWithAccessory: Story = {
  args: { heading: "Cash" },
  render: (args) => (
    <TopPageHeader
      {...args}
      heading={<Title order={2}>{args.heading}</Title>}
      headingAccessory={
        <Badge size="lg" color="gray">
          CHF
        </Badge>
      }
      actions={
        <Group gap="sm">
          <Button leftSection={<IconBolt size={16} />}>Add Transaction</Button>
          <Button variant="default">Ledger</Button>
        </Group>
      }
    />
  ),
};

export const ResponsiveWithDescription: Story = {
  args: { heading: "Everyday account CHF", layout: "responsive" },
  render: (args) => (
    <TopPageHeader
      {...args}
      heading={<Title order={2}>{args.heading}</Title>}
      headingAccessory={
        <Badge size="lg" color="gray">
          CHF
        </Badge>
      }
      description={
        <Text size="sm" c="dimmed">
          Asset Class: Cash &amp; Cash Equivalents / Bank Deposits
        </Text>
      }
      actions={
        <Button leftSection={<IconBolt size={16} />}>Add Transaction</Button>
      }
    />
  ),
};
