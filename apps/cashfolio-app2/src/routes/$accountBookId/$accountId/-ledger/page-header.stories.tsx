import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, Button, Group } from "@mantine/core";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { AssetClassContext } from "@/classification-context";
import { defaultAssetClassIds } from "@/shared/asset-class";
import { LedgerPageView } from "./page-view";
import { LedgerPageStoryHarness } from "./page-view.story-harness";

const meta: Meta<typeof LedgerPageView> = {
  title: "Routes/LedgerHeaderLayout",
  component: LedgerPageView,
};
export default meta;
type Story = StoryObj<typeof meta>;

const longAccountName =
  "EverydayaccountCHFWithAnUnusuallyLongUnbrokenName".repeat(3);
const longGroupPathSegments = [
  "Household Accounts and Long-Term Cash Reserves",
  "VeryLongUnbrokenAccountGroupName".repeat(3),
];
const longAssetClassNodes = [
  {
    id: "long-parent",
    name: "Institutional Cash Reserves and Long-Term Liquidity Management",
    parentId: null,
    sortOrder: 0,
  },
  {
    id: "long-child",
    name: "VeryLongUnbrokenClassificationName".repeat(3),
    parentId: "long-parent",
    sortOrder: 0,
  },
];

function ResponsiveLedgerHeaderHarness({
  initialWidth = 1408,
  longContent = false,
  resizable = false,
  onOpenImportPage,
}: {
  initialWidth?: number;
  longContent?: boolean;
  resizable?: boolean;
  onOpenImportPage?: () => void;
}) {
  const [width, setWidth] = useState(initialWidth);
  const ledger = (
    <LedgerPageStoryHarness
      accountName={longContent ? longAccountName : "Everyday account CHF"}
      groupPathSegments={longContent ? longGroupPathSegments : undefined}
      assetClassId={
        longContent ? "long-child" : defaultAssetClassIds.BANK_DEPOSITS
      }
      includePeriodFilterControls
      onOpenImportPage={onOpenImportPage}
    />
  );
  return (
    <Box style={{ overflowX: "auto" }}>
      {resizable && (
        <Group mb="sm">
          <Button onClick={() => setWidth(1280)}>Wide Boundary</Button>
          <Button onClick={() => setWidth(960)}>Narrow Container</Button>
          <Button onClick={() => setWidth(768)}>Tablet Boundary</Button>
          <Button onClick={() => setWidth(342)}>Phone Container</Button>
        </Group>
      )}
      <Box w={width} data-testid="ledger-header-container">
        {longContent ? (
          <AssetClassContext.Provider value={longAssetClassNodes}>
            {ledger}
          </AssetClassContext.Provider>
        ) : (
          ledger
        )}
      </Box>
    </Box>
  );
}

async function checkResponsiveLedgerHeader(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const container = canvas.getByTestId("ledger-header-container");
  const heading = canvas.getByRole("heading", { level: 2 });
  const metadata = canvas.getByTestId("ledger-header-metadata");
  const toolbar = canvas.getByRole("group", { name: "Ledger Controls" });
  const switcher = canvas.getByRole("button", { name: /^Switch Account:/ });
  await expect(
    canvas.getAllByText(switcher.textContent!, { exact: true }),
  ).toHaveLength(1);
  await expect(
    canvas.queryByRole("combobox", { name: "Search Accounts" }),
  ).not.toBeInTheDocument();
  const period = canvas.getByRole("button", {
    name: "Previous Period",
  }).parentElement!;
  const menu = canvas.getByRole("button", { name: "Account Actions" });
  const split = menu.parentElement!;
  const add = canvas.getByRole("button", { name: "Add Transaction" });

  await waitFor(() => {
    const bounds = container.getBoundingClientRect();
    const header = heading
      .closest(".cf-page-shell")!
      .firstElementChild!.getBoundingClientRect();
    for (const element of [
      heading,
      switcher,
      metadata,
      toolbar,
      period,
      split,
      add,
    ]) {
      const rect = element.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(bounds.left - 1);
      expect(rect.right).toBeLessThanOrEqual(bounds.right + 1);
      expect(rect.bottom).toBeLessThanOrEqual(header.bottom + 1);
    }
    expect(container.scrollWidth).toBeLessThanOrEqual(
      container.clientWidth + 1,
    );
    expect(metadata.scrollWidth).toBeLessThanOrEqual(metadata.clientWidth + 1);
    if (bounds.width >= 1280) {
      expect(toolbar.getBoundingClientRect().top).toBeCloseTo(header.top, 0);
      expect(heading.getBoundingClientRect().right).toBeLessThanOrEqual(
        toolbar.getBoundingClientRect().left,
      );
    } else {
      expect(toolbar.getBoundingClientRect().top).toBeGreaterThan(
        metadata.getBoundingClientRect().bottom,
      );
    }
    if (bounds.width < 768) {
      expect(split.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        period.getBoundingClientRect().bottom,
      );
      expect(add.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        split.getBoundingClientRect().bottom,
      );
      for (const element of [period, split, add]) {
        expect(element.getBoundingClientRect().width).toBeCloseTo(
          bounds.width,
          0,
        );
      }
      expect(menu.getBoundingClientRect().width).toBeLessThanOrEqual(40);
      for (const element of [
        menu,
        canvas.getByRole("button", { name: "Next Period" }),
      ]) {
        expect(element.getBoundingClientRect().right).toBeCloseTo(
          bounds.right,
          0,
        );
      }
    } else {
      expect(period.getBoundingClientRect().left).toBeCloseTo(
        toolbar.getBoundingClientRect().left,
        0,
      );
      expect(add.getBoundingClientRect().right).toBeCloseTo(
        toolbar.getBoundingClientRect().right,
        0,
      );
      expect(period.getBoundingClientRect().top).toBeCloseTo(
        add.getBoundingClientRect().top,
        0,
      );
    }
  });

  if (container.getBoundingClientRect().width < 768) {
    await userEvent.click(switcher);
    const dialog = await screen.findByRole("listbox", {
      name: "Accounts",
    });
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Search Accounts" }),
      ).toHaveFocus(),
    );
    await waitFor(() => {
      const bounds = dialog.getBoundingClientRect();
      expect(bounds.left).toBeGreaterThanOrEqual(15);
      expect(bounds.right).toBeLessThanOrEqual(window.innerWidth - 15);
      expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
    });
    await userEvent.keyboard("{Escape}");
    await expect(switcher).toHaveFocus();
  }
}

export const ResponsiveHeaderWide: Story = {
  render: () => <ResponsiveLedgerHeaderHarness />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        "Asset Class: Cash & Cash Equivalents / Bank Deposits",
      ),
    ).toBeVisible();
    await checkResponsiveLedgerHeader(canvasElement);
  },
};

export const ResponsiveHeaderIntermediate: Story = {
  render: () => <ResponsiveLedgerHeaderHarness initialWidth={960} />,
  play: async ({ canvasElement }) => checkResponsiveLedgerHeader(canvasElement),
};

export const ResponsiveHeaderPhone: Story = {
  args: { onOpenImportPage: fn() },
  render: (args) => (
    <ResponsiveLedgerHeaderHarness
      initialWidth={342}
      onOpenImportPage={args.onOpenImportPage}
    />
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await checkResponsiveLedgerHeader(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Import Statement" }),
    );
    await expect(args.onOpenImportPage).toHaveBeenCalledTimes(1);
    await userEvent.click(
      canvas.getByRole("button", { name: "Account Actions" }),
    );
    await expect(
      await screen.findByRole("menuitem", { name: "Edit" }),
    ).toBeEnabled();
    await userEvent.keyboard("{Escape}");
  },
};

export const ResponsiveHeaderContainerResize: Story = {
  render: () => <ResponsiveLedgerHeaderHarness resizable />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const viewportWidth = window.innerWidth;
    await checkResponsiveLedgerHeader(canvasElement);
    for (const name of [
      "Wide Boundary",
      "Narrow Container",
      "Tablet Boundary",
      "Phone Container",
    ]) {
      await userEvent.click(canvas.getByRole("button", { name }));
      await checkResponsiveLedgerHeader(canvasElement);
      await expect(window.innerWidth).toBe(viewportWidth);
    }
  },
};

export const ResponsiveHeaderLongContent: Story = {
  render: () => <ResponsiveLedgerHeaderHarness longContent resizable />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: longAccountName }),
    ).toBeVisible();
    await expect(canvas.getByTitle(/^Asset Class:/)).toHaveTextContent(
      `Asset Class: ${longAssetClassNodes[0].name} / ${longAssetClassNodes[1].name}`,
    );
    await expect(
      canvas.getByTestId("ledger-header-metadata"),
    ).toHaveTextContent(
      `Account Group: ${longGroupPathSegments.join(" / ")} · Asset Class: ${longAssetClassNodes[0].name} / ${longAssetClassNodes[1].name}`,
    );
    await checkResponsiveLedgerHeader(canvasElement);
    for (const name of [
      "Wide Boundary",
      "Narrow Container",
      "Tablet Boundary",
      "Phone Container",
    ]) {
      await userEvent.click(canvas.getByRole("button", { name }));
      await checkResponsiveLedgerHeader(canvasElement);
    }
  },
};
