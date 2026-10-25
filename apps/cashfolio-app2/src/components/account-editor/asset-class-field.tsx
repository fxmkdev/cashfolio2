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
import { useId } from "react";
import { assetClassOptions } from "../../shared/asset-class";

export function AssetClassField(props: SelectProps) {
  const inputId = useId();

  return (
    <Stack gap={4}>
      <Group gap={4}>
        <Input.Label htmlFor={inputId}>Asset Class</Input.Label>
        <Popover
          width={300}
          position="bottom-start"
          withArrow
          shadow="md"
          withinPortal
          middlewares={{ flip: true, shift: { padding: 12 } }}
        >
          <Popover.Target>
            <Tooltip label="Show Asset Class Help">
              <ActionIcon
                aria-label="Show Asset Class Help"
                size="sm"
                variant="subtle"
              >
                <IconInfoCircle size={16} />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <Text size="sm">
              Classifies what this account represents. Future asset-class
              reports will apply this selection to all historical periods.
              Changing it does not change total amounts or valuation.
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
