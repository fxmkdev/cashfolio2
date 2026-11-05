import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge, Button, Group, Text, Title } from "@mantine/core";
import { IconBolt, IconListDetails } from "@tabler/icons-react";
import { TopPageHeader } from "./top-page-header";

const meta = {
  title: "Components/TopPageHeader",
  component: TopPageHeader,
  args: {
    heading: null,
  },
} satisfies Meta<typeof TopPageHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TitleHeading: Story = {
  render: () => (
    <TopPageHeader
      heading={<Title order={2}>February 2026</Title>}
      actions={
        <Button variant="default" leftSection={<IconListDetails size={16} />}>
          Accounts
        </Button>
      }
    />
  ),
};

export const TitleWithAccessory: Story = {
  render: () => (
    <TopPageHeader
      heading={<Title order={2}>Cash</Title>}
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
  render: () => (
    <TopPageHeader
      layout="responsive"
      heading={<Title order={2}>Everyday account CHF</Title>}
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
