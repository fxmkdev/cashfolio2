import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge, Button, Group, Title } from "@mantine/core";
import { IconBolt, IconListDetails } from "@tabler/icons-react";
import { AccountPathHeading } from "./account-path-heading";
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

export const BreadcrumbWithAccessory: Story = {
  render: () => (
    <TopPageHeader
      heading={
        <AccountPathHeading
          accountBookId="storybook-book"
          tab="ASSET"
          mode="active"
          extraSegments={["Asset", "Cash", "neon", "neon"]}
        />
      }
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
