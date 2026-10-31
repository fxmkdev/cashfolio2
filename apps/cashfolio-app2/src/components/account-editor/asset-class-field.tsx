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
import { assetClassOptions } from "../../shared/asset-class";

export function AssetClassField(props: SelectProps) {
  const inputId = useId();
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const [helpOpened, setHelpOpened] = useState(false);

  return (
    <Stack gap={4}>
      <Group gap={4}>
        <Input.Label htmlFor={inputId}>Asset Class</Input.Label>
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
              aria-label="Show Asset Class Help"
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
            label="Show Asset Class Help"
            disabled={helpOpened}
          />
          <Popover.Dropdown data-mantine-stop-propagation>
            <Text size="sm">
              Classifies what this account represents. Asset-class reports apply
              this selection to all historical periods. Changing it does not
              change total amounts or valuation.
            </Text>
          </Popover.Dropdown>
        </Popover>
      </Group>
      <Select
        id={inputId}
        placeholder="Unclassified"
        clearable
        data={[{ value: "", label: "Unclassified" }, ...assetClassOptions]}
        {...props}
      />
    </Stack>
  );
}
