import { Group, Select, Text } from "@mantine/core";
import type { AccountReturnBasis } from "@/shared/accounts/account-returns";

export function ReturnBasisSelect({
  value,
  onChange,
}: {
  value: AccountReturnBasis;
  onChange: (basis: AccountReturnBasis) => void;
}) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Text size="sm">Return Basis</Text>
      <Select
        aria-label="Return Basis"
        w={150}
        value={value}
        allowDeselect={false}
        data={[
          { value: "annualized", label: "Annualized" },
          { value: "cumulative", label: "Cumulative" },
        ]}
        onChange={(next) => {
          if (next === "annualized" || next === "cumulative") onChange(next);
        }}
      />
    </Group>
  );
}
