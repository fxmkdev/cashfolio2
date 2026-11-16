import { Stack, Text, Tooltip } from "@mantine/core";
import { useUserLocale } from "@/user-locale-context";
import type {
  AccountReturnBasis,
  AccountReturnResult,
} from "@/shared/accounts/account-returns";
import {
  accountReturnBasisLabels,
  getAccountReturnDisplay,
} from "@/shared/accounts/account-return-display";

export function ReturnValue({
  data,
  basis,
}: {
  data: AccountReturnResult;
  basis: AccountReturnBasis;
}) {
  const locale = useUserLocale();
  const formatter = new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const { value, explanation } = getAccountReturnDisplay(data, basis);
  return (
    <Stack gap={2}>
      <Text size="sm" c="dimmed">
        Return {accountReturnBasisLabels[basis]}
      </Text>
      <Tooltip
        label={explanation}
        multiline
        w={320}
        events={{ hover: true, focus: true, touch: false }}
      >
        <Text
          tabIndex={0}
          fw={700}
          data-testid={`account-return-${basis}`}
          aria-label={`Return ${accountReturnBasisLabels[basis]}: ${value == null ? explanation : formatter.format(value)}`}
          c={
            value == null || value === 0
              ? undefined
              : value > 0
                ? "green"
                : "red"
          }
        >
          {value == null ? "—" : formatter.format(value)}
        </Text>
      </Tooltip>
    </Stack>
  );
}
