import { SimpleGrid, Stack, Text, Tooltip } from "@mantine/core";
import { useUserLocale } from "@/user-locale-context";
import {
  accountReturnExplanation,
  type AccountReturnResult,
} from "@/shared/account-returns";

export function ReturnValues({
  data,
  annualized = false,
}: {
  data: AccountReturnResult;
  annualized?: boolean;
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
        const value = annualized
          ? metric === "twr"
            ? data.annualizedTwr
            : data.annualizedMwr
          : data[metric];
        return (
          <Stack gap={2} key={metric}>
            <Text size="sm" c="dimmed">
              {metric.toUpperCase()}
              {annualized ? " Annualized" : ""}
            </Text>
            <Tooltip
              label={accountReturnExplanation(data, metric)}
              multiline
              w={320}
              events={{ hover: true, focus: true, touch: false }}
            >
              <Text
                tabIndex={0}
                fw={700}
                data-testid={`account-return-${annualized ? "annualized-" : ""}${metric}`}
                aria-label={`${metric.toUpperCase()}${annualized ? " Annualized" : ""}: ${value == null ? accountReturnExplanation(data, metric) : formatter.format(value)}`}
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
