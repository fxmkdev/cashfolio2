import {
  ActionIcon,
  Group,
  Input,
  Popover,
  Select,
  type SelectProps,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useId, useRef, useState } from "react";
import { accountTrackingMethodOptions } from "../../shared/account-tracking-method";

export function TrackingMethodField(props: SelectProps) {
  const inputId = useId();
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const [helpOpened, setHelpOpened] = useState(false);

  return (
    <Stack gap={4}>
      <Group gap={4}>
        <Input.Label htmlFor={inputId}>Tracking Method</Input.Label>
        <Popover
          opened={helpOpened}
          onChange={setHelpOpened}
          width={300}
          position="bottom-start"
          withArrow
          shadow="md"
          withinPortal
          trapFocus
          returnFocus
          middlewares={{ flip: true, shift: { padding: 12 } }}
        >
          <Popover.Target>
            <ActionIcon
              ref={helpButtonRef}
              aria-label="Show Tracking Method Help"
              size="sm"
              variant="subtle"
              data-mantine-stop-propagation={helpOpened || undefined}
              onClick={() => setHelpOpened((opened) => !opened)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && helpOpened) {
                  event.preventDefault();
                  event.stopPropagation();
                  setHelpOpened(false);
                }
              }}
            >
              <IconInfoCircle size={16} />
            </ActionIcon>
          </Popover.Target>
          <Tooltip
            target={helpButtonRef}
            label="Show Tracking Method Help"
            disabled={helpOpened}
          />
          <Popover.Dropdown data-mantine-stop-propagation>
            <Text size="sm">
              Track individual units, or an account’s total monetary value with
              valuation changes recorded as Gain/Loss transactions. Total Value
              accounts appear together under Total Value Accounts within their
              assigned asset class.
            </Text>
          </Popover.Dropdown>
        </Popover>
      </Group>
      <Select
        id={inputId}
        allowDeselect={false}
        data={accountTrackingMethodOptions}
        {...props}
      />
    </Stack>
  );
}
