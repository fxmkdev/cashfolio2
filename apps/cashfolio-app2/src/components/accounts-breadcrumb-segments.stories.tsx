import type { Meta, StoryObj } from "@storybook/react-vite";
import { Breadcrumbs } from "@mantine/core";
import { getAccountsBreadcrumbSegments } from "./accounts-breadcrumb-segments";

function BreadcrumbSegmentsStory({
  accountBookId,
  tab,
  mode,
  archiveIsLink,
}: {
  accountBookId: string;
  tab: "ASSET" | "LIABILITY" | "EQUITY-INCOME";
  mode: "active" | "archived";
  archiveIsLink?: boolean;
}) {
  return (
    <Breadcrumbs>
      {getAccountsBreadcrumbSegments({
        accountBookId,
        tab,
        mode,
        archiveIsLink,
      })}
    </Breadcrumbs>
  );
}

const meta = {
  title: "Components/AccountsBreadcrumbSegments",
  component: BreadcrumbSegmentsStory,
  args: {
    accountBookId: "storybook-book",
    tab: "ASSET",
    mode: "active",
    archiveIsLink: true,
  },
} satisfies Meta<typeof BreadcrumbSegmentsStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Active: Story = {};

export const ArchivedWithLink: Story = {
  args: {
    mode: "archived",
    archiveIsLink: true,
  },
};

export const ArchivedCurrentSegment: Story = {
  args: {
    mode: "archived",
    archiveIsLink: false,
  },
};
