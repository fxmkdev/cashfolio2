import { Button, Group, Stack, Text } from "@mantine/core";
import { nprogress } from "@mantine/nprogress";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef } from "react";
import { NavigationLoadingBar } from "./navigation-loading-bar";

function NavigationLoadingBarPreview() {
  const completeTimeoutRef = useRef<number | undefined>(undefined);

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
      <Text size="sm" c="dimmed">
        Shows while route loads are in-flight. Use the controls below to preview
        the progress bar styling in Storybook.
      </Text>
      <Group>
        <Button
          size="xs"
          variant="default"
          onClick={() => {
            clearPendingCompleteTimeout();
            nprogress.start();
          }}
        >
          Start
        </Button>
        <Button
          size="xs"
          variant="default"
          onClick={() => {
            clearPendingCompleteTimeout();
            nprogress.complete();
          }}
        >
          Complete
        </Button>
        <Button
          size="xs"
          onClick={() => {
            clearPendingCompleteTimeout();
            nprogress.start();
            completeTimeoutRef.current = window.setTimeout(() => {
              completeTimeoutRef.current = undefined;
              nprogress.complete();
            }, 1000);
          }}
        >
          Simulate 1s Load
        </Button>
      </Group>
    </Stack>
  );
}

const meta = {
  title: "Components/NavigationLoadingBar",
  component: NavigationLoadingBar,
  render: () => <NavigationLoadingBarPreview />,
} satisfies Meta<typeof NavigationLoadingBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
