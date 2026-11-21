import type { Meta, StoryObj } from "@storybook/react-vite";
import { LedgerPageView } from "./page-view";
import { LedgerPageStoryHarness } from "./page-view.story-harness";
import { Button, Text } from "@mantine/core";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { expect, screen, userEvent, within } from "storybook/test";
import { AccountType } from "@/.prisma-client/enums";
import { useLedgerNavigationState } from "@/hooks/use-ledger-navigation-state";
import { ledgerPageStoryMeta } from "./page-view.story-meta";

const meta: Meta<typeof LedgerPageView> = {
  ...ledgerPageStoryMeta,
  title: "Screens/Ledger/Overview",
};
export default meta;
type Story = StoryObj<typeof meta>;

export const PeriodFilterRouteSmoke: Story = {
  parameters: {
    router: {
      initialPath: "/storybook-book/account-checking",
    },
  },
  render: () => (
    <LedgerPageStoryHarness
      routeSmoke={true}
      includePeriodFilterControls={true}
      accountType={AccountType.EQUITY}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "(none)",
    );
    await userEvent.click(canvas.getByRole("button", { name: "All Periods" }));
    await expect(
      await screen.findByRole("button", { name: "Clear Filter" }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: "Year" }));
    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "(none)",
    );

    await userEvent.click(screen.getByRole("radio", { name: "Month" }));
    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "(none)",
    );

    await userEvent.click(screen.getByRole("button", { name: /Feb/i }));

    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "2026-02",
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Previous Period" }),
    );
    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "2026-01",
    );

    await userEvent.click(canvas.getByRole("button", { name: "January 2026" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear Filter" }));
    await expect(canvas.getByTestId("router-search-period")).toHaveTextContent(
      "(none)",
    );
  },
  name: "Period Filter Route Smoke Interaction Test",
  tags: ["regression", "!autodocs"],
};

function StableLedgerNavigationHarness() {
  const navigate = useNavigate();
  const navigationState = useLedgerNavigationState();
  const [initialState] = useState(() => navigationState);
  const [renders, setRenders] = useState(0);
  return (
    <>
      <Button onClick={() => setRenders((count) => count + 1)}>
        Render Modal State
      </Button>
      <Button
        onClick={async () => {
          await navigate({
            to: "/$accountBookId/report",
            params: { accountBookId: "storybook-book" },
            search: { period: "2026-02" },
          });
          setRenders((count) => count + 1);
        }}
      >
        Change Source Period
      </Button>
      <Text data-testid="source-href">
        {navigationState().ledgerReturnTarget?.href}
      </Text>
      <Text data-testid="local-render-count">{renders}</Text>
      <Text data-testid="stable-navigation-state">
        {String(initialState === navigationState)}
      </Text>
    </>
  );
}

export const StableNavigationStateView: Story = {
  parameters: {
    router: { initialPath: "/storybook-book/report?period=2026-01" },
  },
  render: () => <StableLedgerNavigationHarness />,
  name: "Stable Navigation State Playground",
  tags: ["!regression"],
  play: undefined,
};

export const StableNavigationState: Story = {
  ...StableNavigationStateView,
  name: "Stable Navigation State Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Render Modal State" }),
    );
    await expect(canvas.getByTestId("local-render-count")).toHaveTextContent(
      "1",
    );
    await expect(
      canvas.getByTestId("stable-navigation-state"),
    ).toHaveTextContent("true");
    await userEvent.click(
      canvas.getByRole("button", { name: "Change Source Period" }),
    );
    await expect(canvas.getByTestId("source-href")).toHaveTextContent(
      "/storybook-book/report?period=2026-02",
    );
    await expect(
      canvas.getByTestId("stable-navigation-state"),
    ).toHaveTextContent("true");
  },
};
