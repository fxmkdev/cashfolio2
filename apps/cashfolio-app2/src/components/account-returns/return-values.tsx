import { SimpleGrid, Stack, Text, Tooltip } from "@mantine/core";
import { useUserLocale } from "@/user-locale-context";
import type {
  AccountReturnBasis,
  AccountReturnResult,
} from "@/shared/accounts/account-returns";
import {
  accountReturnBasisLabels,
  getAccountReturnDisplay,
} from "@/shared/accounts/account-return-display";

export function ReturnValues({
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
  return (
    <SimpleGrid cols={2}>
      {(["twr", "mwr"] as const).map((metric) => {
        const { value, explanation } = getAccountReturnDisplay(
          data,
          metric,
          basis,
        );
        return (
          <Stack gap={2} key={metric}>
            <Text size="sm" c="dimmed">
              {`${metric.toUpperCase()} ${accountReturnBasisLabels[basis]}`}
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
                data-testid={`account-return-${basis}-${metric}`}
                aria-label={`${metric.toUpperCase()} ${accountReturnBasisLabels[basis]}: ${value == null ? explanation : formatter.format(value)}`}
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
      })}
    </SimpleGrid>
  );
}
