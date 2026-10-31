import { Button, Group, Stack, Text } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { NavigationLoadingBar } from "./navigation-loading-bar";
import { GlobalLoadingProvider, useGlobalLoading } from "./global-loading";

function SecondaryTask() {
  useGlobalLoading(true);
  return null;
}

function NavigationLoadingBarPreview() {
  const completeTimeoutRef = useRef<number | undefined>(undefined);
  const [active, setActive] = useState(false);
  const [secondary, setSecondary] = useState(false);
  useGlobalLoading(active);

  function clearPendingCompleteTimeout() {
    if (completeTimeoutRef.current === undefined) return;

    window.clearTimeout(completeTimeoutRef.current);
    completeTimeoutRef.current = undefined;
  }

  useEffect(() => {
    return () => {
      clearPendingCompleteTimeout();
    };
  }, []);

  return (
    <Stack gap="sm" py="md">
      <NavigationLoadingBar />
      {secondary && <SecondaryTask />}
      <Text size="sm" c="dimmed">
        Shows while routes or registered client tasks are loading. Use the
        controls below to preview the progress bar styling in Storybook.
      </Text>
      <Group>
        <Button
          size="xs"
          variant="default"
          onClick={() => {
            clearPendingCompleteTimeout();
            setActive(true);
          }}
        >
          Start
        </Button>
        <Button
          size="xs"
          variant="default"
          onClick={() => {
            clearPendingCompleteTimeout();
            setActive(false);
          }}
        >
          Complete
        </Button>
        <Button
          size="xs"
          onClick={() => {
            clearPendingCompleteTimeout();
            setActive(true);
            completeTimeoutRef.current = window.setTimeout(() => {
              completeTimeoutRef.current = undefined;
              setActive(false);
            }, 1000);
          }}
        >
          Simulate 1s Load
        </Button>
        <Button onClick={() => setSecondary(true)}>Start Other Load</Button>
        <Button onClick={() => setSecondary(false)}>Complete Other Load</Button>
      </Group>
    </Stack>
  );
}

const meta = {
  title: "Components/NavigationLoadingBar",
  component: NavigationLoadingBar,
  render: () => (
    <GlobalLoadingProvider>
      <NavigationLoadingBarPreview />
    </GlobalLoadingProvider>
  ),
} satisfies Meta<typeof NavigationLoadingBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OverlappingClientLoads: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const indicator = within(canvasElement.ownerDocument.body).getByTestId(
      "global-loading-indicator",
    );
    await userEvent.click(canvas.getByRole("button", { name: /^Start$/ }));
    await waitFor(() =>
      expect(indicator).toHaveAttribute("data-mounted", "true"),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Start Other Load" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: /^Complete$/ }));
    await expect(indicator).toHaveAttribute("data-mounted", "true");
    // Unmounting a registered sibling releases its task without leaking progress.
    await userEvent.click(
      canvas.getByRole("button", { name: "Complete Other Load" }),
    );
    await waitFor(() => expect(indicator).not.toHaveAttribute("data-mounted"));
  },
};
